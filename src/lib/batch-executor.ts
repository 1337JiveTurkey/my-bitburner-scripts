import { NS } from "@ns"
import Log from "lib/logging"
import { BatchStats } from "lib/batch-stats"
import { WorkerPool, CompoundTask, HackTask, GrowTask, WeakenTask, MAX_SCRIPTS } from "lib/worker"

/**
 * Executes a batch that's been calculated by a BatchCalculator.
 */
export default class BatchExecutor {
	readonly #ns: NS

	readonly #log: Log
	readonly #pool: WorkerPool

	/**
	 * Extra milliseconds added to the shared deadline beyond one weaken time.
	 * Weakens have zero natural slack: their duration IS the base flight
	 * time, so any weaken that starts after the deadline is stamped computes
	 * a negative additionalMsec, clamps to zero, and lands late by its own
	 * launch delay. On a fleet big enough that launching the wave takes
	 * seconds, that slides the entire weaken group behind the hack+grow
	 * burst — security piles up unweakened to the 100 cap and hack chance
	 * hits zero mid-wave. Size this above the fleet's launch spread; the
	 * per-wave deadline-slack log line reports the observed margin to tune by.
	 */
	launchSlack = 5000

	/**
	 * Standing backlog of unhealed hacks a landing hack sees, in batches.
	 * The wave lands as a fair merge of one in-order stream per host
	 * (measured: mean same-type run 1.5, median hack-to-grow gap ≈ 50
	 * scripts on a 29-host fleet), so each batch's grow lands about a merge
	 * round after its hack and every hack finds the server already drained
	 * by ~L other batches. Take matched (1 - hackPercent)^L with L ≈ 7.0-7.3
	 * across 3.55% and 4.65% batch shapes. bestBatch discounts candidates
	 * by that factor, which steers selection toward smaller hackPercent on
	 * wider fleets. hostSpacing removes the merge itself and leaves only a
	 * residual ~0.9 (adjacent batch pairs still swap; measured 96-97% take
	 * at 4.65% batches), so with spacing active this should sit near 1,
	 * and near 7 only when spacing is off. 0 disables the discount.
	 */
	backlogBatches = 1.0

	/**
	 * Milliseconds between consecutive hosts' deadlines. The standing
	 * backlog behind backlogBatches comes from the wave landing as a fair
	 * merge of one in-order stream per host; spacing hosts' deadlines
	 * segments the merge back into whole host streams. Expiry order
	 * dominates the interleave, so segmentation holds even when the engine
	 * processes a host's landings slower than the spacing. Costs hosts ×
	 * spacing of added tail — fixed in fleet size, unlike the per-batch
	 * spacing the design forbids. 0 keeps one shared deadline for all.
	 * Validated at 100ms on a 29-host fleet: 0/29 stream overlaps and the
	 * gain ratio rose from ~72% to ~97%; the jitter it must beat is
	 * millisecond-scale, so it can likely be tightened toward ~25ms.
	 */
	hostSpacing = 100

	constructor(ns: NS, log: Log|null=null) {
		this.#ns = ns
		if (log) {
			this.#log = log
		} else {
			this.#log = new Log(ns)
		}
		this.#pool = new WorkerPool(ns)
		this.#log.fine("Created BatchExecutor with " + this.#pool.workers.length + " workers.")
	}

	/**
	 * Estimates the best possible batch for the worker pool available
	 *
	 * @param batches The possible batches to execute
	 */
	bestBatch(batches: BatchStats[]): BatchStats|null {
		let bestTotal = 0
		let bestBatch = null
		for (const batch of batches) {
			const total = this.estimateTotal(batch)
			if (total > bestTotal) {
				bestTotal = total
				bestBatch = batch
			}
		}

		if (bestBatch) {
			this.#log.info("Selected %dh/%dg/%dw batches: %s expected take under a %s-batch backlog",
				bestBatch.hackThreads, bestBatch.growThreads, bestBatch.weakThreads,
				this.#ns.format.percent(Math.pow(1 - bestBatch.hackPercent, this.backlogBatches)),
				this.#ns.format.number(this.backlogBatches))
		}
		return bestBatch
	}

	estimateTotal(batch: BatchStats): number {
		const ramLimited = this.#pool.numberOfInstances(batch.batchRam)
		const countLimited = MAX_SCRIPTS / 3
		const batches = Math.min(ramLimited, countLimited)
		const expectedTake = Math.pow(1 - batch.hackPercent, this.backlogBatches)
		return batch.hackMoney * expectedTake * batches
	}

	/**
	 * Runs the batch across the pool and returns the money it stole.
	 *
	 * Every script self-times toward the same absolute deadline from its own
	 * live duration, so drift between scheduling and starting doesn't move
	 * its landing; scripts sharing a deadline land in creation order.
	 *
	 * The shared deadline is deliberate (shotgun batching): waves can reach
	 * tens of thousands of batches, so per-batch landing offsets multiply
	 * into minutes of dead tail. Staggering has been tried and reverted —
	 * do not reintroduce it.
	 */
	async runOnWorkers(batch: BatchStats): Promise<number> {
		const target = batch.target
		const hostname = target.hostname
		this.#log.fine("Targeting %s with %s", hostname, this.#ns.format.percent(batch.hackPercent))

		this.#pool.workers.forEach((worker, i) => worker.landingOffset = i * this.hostSpacing)
		const endTime = Date.now() + this.#ns.getWeakenTime(hostname) + this.launchSlack
		const levelAtFire = this.#ns.getHackingLevel()
		const hackTask = new HackTask(this.#ns, hostname, batch.hackThreads, endTime)
		const growTask = new GrowTask(this.#ns, hostname, batch.growThreads, endTime)
		const weakenTask = new WeakenTask(this.#ns, hostname, batch.weakThreads, endTime)
		const batchTask = new CompoundTask(hackTask, growTask, weakenTask)

		const results = await this.#pool.executeBatchTask(batchTask)
		const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
		if (failures.length > 0) {
			this.#log.warn("%d of %d batch scripts failed to launch: %s",
				failures.length, results.length - 1, failures[0].reason)
		}
		this.#logWaveStats(batch, hackTask, growTask, weakenTask)
		this.#logHackLedger(batch, hackTask, levelAtFire)
		this.#auditLandingOrder(hackTask, growTask, weakenTask)
		this.#auditDeadlineMargin(hackTask, growTask, weakenTask)
		this.#logLandingProfile(batch, hackTask, growTask)
		this.#auditHostBlocking(hackTask, growTask, weakenTask)
		this.#auditInterleave(hackTask, growTask, weakenTask)
		return hackTask.proceeds
	}

	/**
	 * Compares what the wave was sized to steal against what the hacks paid
	 * out. proceeds is the player's gain, so the ratio's ceiling is BitNode
	 * ScriptHackMoneyGain (1 in BN1, lower where scaled) times the hack
	 * success chance, which sizing doesn't model — expect the chance's
	 * shortfall even in a perfect wave until the level well outgrows the
	 * target. Watch for movement in the ratio, not its absolute value: a
	 * drop means hacks landed on a poorer or harder server than sizing
	 * assumed, and a level jump at a flat ratio means sizing kept up.
	 */
	#logHackLedger(batch: BatchStats, hackTask: HackTask, levelAtFire: number) {
		const f = this.#ns.format
		const sized = batch.hackMoney * hackTask.launches
		this.#log.info("Hack ledger: $%s gained of $%s sized server loss (%s gain ratio); hacking level %d at fire, %d now",
			f.number(hackTask.proceeds), f.number(sized),
			f.percent(sized ? hackTask.proceeds / sized : 0),
			levelAtFire, this.#ns.getHackingLevel())
	}

	/**
	 * Checks every batch's promises resolved hack, grow, weaken. Resolution
	 * order is a proxy for landing order (the stamp is taken as each worker's
	 * port write is processed), so treat violations as strong evidence, not
	 * proof, of out-of-order landings. This only compares within a batch, so
	 * it is blind to a whole op type sliding behind the rest of the wave
	 * (every weaken landing dead last still satisfies h < g < w) — the
	 * deadline-margin audit covers that case.
	 */
	#auditLandingOrder(hackTask: HackTask, growTask: GrowTask, weakenTask: WeakenTask) {
		const batches = weakenTask.launches
		let growBeforeHack = 0
		let weakenEarly = 0
		let unstamped = 0
		for (let i = 0; i < batches; i++) {
			const h = hackTask.landingOrder[i]
			const g = growTask.landingOrder[i]
			const w = weakenTask.landingOrder[i]
			if (h === undefined || g === undefined || w === undefined) {
				unstamped++
				continue
			}
			if (g < h) {
				growBeforeHack++
			}
			if (w < h || w < g) {
				weakenEarly++
			}
		}
		if (growBeforeHack || weakenEarly || unstamped) {
			this.#log.warn("Landing order violations: %d/%d grows resolved before their hack, "
				+ "%d/%d weakens resolved early, %d batches unstamped",
				growBeforeHack, batches, weakenEarly, batches, unstamped)
		} else {
			this.#log.info("All %d batches resolved in HGW order", batches)
		}
	}

	/**
	 * Aggregates the deadline margins the workers reported at start: a
	 * clamped script landed late by its overshoot, and the tightest margin
	 * is how close the wave came to that. Late weakens are the dangerous
	 * case — the whole type slides behind the hack+grow burst and security
	 * caps out (see launchSlack). Healthy is zero clamps with margin to
	 * spare; raise the slack when the spare shrinks toward zero.
	 */
	#auditDeadlineMargin(hackTask: HackTask, growTask: GrowTask, weakenTask: WeakenTask) {
		const clamped = [hackTask.clamped, growTask.clamped, weakenTask.clamped]
		const margins = [hackTask.minMargin, growTask.minMargin, weakenTask.minMargin]
			.filter((m): m is number => m !== null)
		if (!margins.length) {
			return
		}
		const tightest = Math.min(...margins)
		if (clamped.some(c => c > 0)) {
			this.#log.warn("Deadline slack: %d hacks / %d grows / %d weakens started too late and landed "
				+ "up to %d ms past the shared deadline; raise launch slack to at least %d ms",
				clamped[0], clamped[1], clamped[2],
				Math.ceil(-tightest), Math.ceil(this.launchSlack - tightest))
		} else {
			this.#log.info("Deadline slack: every script made the deadline with %d ms of %d ms launch slack to spare",
				Math.floor(tightest), this.launchSlack)
		}
	}

	/**
	 * Reconstructs the wave's money trajectory from what each op returned,
	 * ordered by resolution stamp. Time-based sampling cannot see inside the
	 * burst: once the wave's timers expire, any later-expiring timer (like a
	 * sampler's sleep) queues behind every remaining landing callback, so it
	 * only ever observes the pre- and post-burst states. Each hack's take is
	 * a direct reading of the money present when it landed, so bucketing
	 * take against landing order shows the crater the end state hides — a
	 * healthy wave holds ~100% of sized in every bucket. The no-op profile
	 * shows where grows found the server already full (overshoot healing).
	 */
	#logLandingProfile(batch: BatchStats, hackTask: HackTask, growTask: GrowTask) {
		const takes: [number, number][] = []
		for (let i = 0; i < hackTask.launches; i++) {
			const stamp = hackTask.landingOrder[i]
			const money = hackTask.outcomes[i]
			if (stamp !== undefined && money !== undefined && batch.hackMoney) {
				takes.push([stamp, money / batch.hackMoney])
			}
		}
		const noops: [number, number][] = []
		for (let i = 0; i < growTask.launches; i++) {
			const stamp = growTask.landingOrder[i]
			const multiplier = growTask.outcomes[i]
			if (stamp !== undefined && multiplier !== undefined) {
				noops.push([stamp, multiplier < 1.0001 ? 1 : 0])
			}
		}
		if (!takes.length) {
			return
		}
		this.#log.info("Hack take by landing order (%% of sized, 20 buckets): %s",
			this.#bucketAverages(takes, 20).map(v => Math.round(v * 100)).join(" "))
		this.#log.info("No-op grows by landing order (%%, 20 buckets): %s",
			this.#bucketAverages(noops, 20).map(v => Math.round(v * 100)).join(" "))
	}

	/**
	 * Tests whether each host's scripts landed grouped by op type. A flat
	 * sub-100% take profile with clean order audits is the signature of
	 * fine type blocks — some unit landing all its hacks, then all its
	 * grows, then its weakens — which neither audit can see, since blocks
	 * violate neither within-batch nor within-type order. Blocks of B
	 * batches predict an average take of (1-q^B)/(B(1-q)) with q = 1 minus
	 * the per-batch hackPercent (~77% at B=16 for 3.55% batches). The
	 * suspect unit is the host: its instances share three script modules,
	 * so per-module start batching would group its landings by type.
	 */
	#auditHostBlocking(hackTask: HackTask, growTask: GrowTask, weakenTask: WeakenTask) {
		const hostStats = new Map<string, { maxH: number, minG: number, maxG: number, minW: number,
			minAll: number, maxAll: number, batches: number }>()
		for (let i = 0; i < weakenTask.launches; i++) {
			const host = hackTask.hosts[i]
			const h = hackTask.landingOrder[i]
			const g = growTask.landingOrder[i]
			const w = weakenTask.landingOrder[i]
			if (host === undefined || h === undefined || g === undefined || w === undefined) {
				continue
			}
			let s = hostStats.get(host)
			if (!s) {
				s = { maxH: -Infinity, minG: Infinity, maxG: -Infinity, minW: Infinity,
					minAll: Infinity, maxAll: -Infinity, batches: 0 }
				hostStats.set(host, s)
			}
			s.maxH = Math.max(s.maxH, h)
			s.minG = Math.min(s.minG, g)
			s.maxG = Math.max(s.maxG, g)
			s.minW = Math.min(s.minW, w)
			s.minAll = Math.min(s.minAll, h, g, w)
			s.maxAll = Math.max(s.maxAll, h, g, w)
			s.batches++
		}
		let hgBlocked = 0
		let gwBlocked = 0
		const sizes: number[] = []
		const ranges: { min: number, max: number }[] = []
		for (const s of hostStats.values()) {
			if (s.batches < 2) {
				continue
			}
			sizes.push(s.batches)
			ranges.push({ min: s.minAll, max: s.maxAll })
			if (s.maxH < s.minG) {
				hgBlocked++
			}
			if (s.maxG < s.minW) {
				gwBlocked++
			}
		}
		if (!sizes.length) {
			return
		}
		sizes.sort((a, b) => a - b)
		const median = sizes[Math.floor(sizes.length / 2)]
		// With host spacing the segments should not overlap at all; without
		// it every stream overlaps its neighbors (the fair merge).
		ranges.sort((a, b) => a.min - b.min)
		let overlaps = 0
		let runningMax = -Infinity
		for (const r of ranges) {
			if (r.min < runningMax) {
				overlaps++
			}
			runningMax = Math.max(runningMax, r.max)
		}
		this.#log.info("Per-host landing: %d/%d multi-batch hosts landed every hack before any grow, "
			+ "%d/%d every grow before any weaken; median %d batches/host; "
			+ "%d/%d host streams overlap an earlier stream",
			hgBlocked, sizes.length, gwBlocked, sizes.length, median, overlaps, sizes.length)
	}

	/**
	 * Reads the landing tape directly. Flat sub-100% take with clean audits
	 * means some fine-scale structure lets hacks find a drained server; the
	 * take math implies mixing at a ~16-batch scale, and per-host type
	 * blocking was ruled out empirically (0/29 hosts at 310 batches/host).
	 * The tape is the ground truth the aggregate stats keep hiding: a
	 * healthy wave reads "hgwhgwhgw…", type blocks read as long same-type
	 * runs, and a uniform hack lead reads as normal runs but a large
	 * hack-to-grow gap.
	 */
	#auditInterleave(hackTask: HackTask, growTask: GrowTask, weakenTask: WeakenTask) {
		const events: [number, number][] = []
		const tasks = [hackTask, growTask, weakenTask]
		for (let t = 0; t < tasks.length; t++) {
			const order = tasks[t].landingOrder
			for (let i = 0; i < order.length; i++) {
				const stamp = order[i]
				if (stamp !== undefined) {
					events.push([stamp, t])
				}
			}
		}
		if (events.length < 3) {
			return
		}
		events.sort((a, b) => a[0] - b[0])
		const position = new Map<number, number>()
		for (let i = 0; i < events.length; i++) {
			position.set(events[i][0], i)
		}
		let runs = 0
		let run = 0
		let maxRun = 0
		for (let i = 0; i < events.length; i++) {
			if (i === 0 || events[i][1] !== events[i - 1][1]) {
				runs++
				run = 1
			} else {
				run++
			}
			maxRun = Math.max(maxRun, run)
		}
		const gaps: number[] = []
		for (let i = 0; i < weakenTask.launches; i++) {
			const h = position.get(hackTask.landingOrder[i] ?? -1)
			const g = position.get(growTask.landingOrder[i] ?? -1)
			if (h !== undefined && g !== undefined) {
				gaps.push(g - h)
			}
		}
		gaps.sort((a, b) => a - b)
		const medianGap = gaps.length ? gaps[gaps.length >> 1] : 0
		const mid = events.length >> 1
		const tape = events.slice(mid, mid + 120).map(e => "hgw"[e[1]]).join("")
		this.#log.info("Landing interleave: mean same-type run %s scripts (max %d); "
			+ "median hack-to-grow gap %d scripts (1 = adjacent); midwave tape: %s",
			this.#ns.format.number(events.length / runs), maxRun, medianGap, tape)
	}

	/** Sorts [stamp, value] pairs by stamp and averages equal-count buckets. */
	#bucketAverages(pairs: [number, number][], buckets: number): number[] {
		pairs.sort((a, b) => a[0] - b[0])
		const out: number[] = []
		for (let b = 0; b < buckets; b++) {
			const start = Math.floor(pairs.length * b / buckets)
			const end = Math.floor(pairs.length * (b + 1) / buckets)
			let sum = 0
			for (let i = start; i < end; i++) {
				sum += pairs[i][1]
			}
			out.push(end > start ? sum / (end - start) : 0)
		}
		return out
	}

	/**
	 * Reports what actually landed, to tell the failure modes apart: weakens
	 * that removed ~nothing landed on a floored server (before the grows);
	 * no-op grows landed on a full server (before the hacks); failed hacks
	 * landed on a hardened server. A consistent ledger with a bad end state
	 * means some other script is changing the server outside this wave.
	 * "added" is an upper bound, not an expectation: the game fortifies a
	 * grow by the cycles actually used to reach max money (bitburner-src
	 * processSingleServerGrowth), so padded overshoot and no-op grows
	 * fortify less than sized — "weakened" landing below "added" while the
	 * server still ends at min is normal, not a leak.
	 */
	#logWaveStats(batch: BatchStats, hackTask: HackTask, growTask: GrowTask, weakenTask: WeakenTask) {
		const f = this.#ns.format
		const s = this.#ns.getServer(batch.target.hostname)
		const secAdded = batch.target.secPerHack * batch.hackThreads * (hackTask.landings - hackTask.failures)
			+ batch.target.secPerGrow * batch.growThreads * growTask.landings
		const weakenPotential = batch.target.secPerWeak * batch.weakThreads * weakenTask.landings
		this.#log.info("Wave stats: %d batches of %dh/%dg/%dw; failed hacks %d/%d; no-op grows %d/%d; "
			+ "weakened %s of %s potential vs at most %s added; end security %s (min %s), money %s",
			weakenTask.landings, batch.hackThreads, batch.growThreads, batch.weakThreads,
			hackTask.failures, hackTask.landings,
			growTask.noops, growTask.landings,
			f.number(weakenTask.reduced), f.number(weakenPotential), f.number(secAdded),
			f.number(s.hackDifficulty ?? -1), f.number(s.minDifficulty ?? -1),
			f.percent((s.moneyAvailable ?? 0) / (s.moneyMax || 1)))
	}

}