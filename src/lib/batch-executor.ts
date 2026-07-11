import { NS } from "@ns"
import Log from "lib/logging"
import { BatchStats } from "lib/batch-stats"
import { WorkerPool, CompoundTask, HackTask, GrowTask, WeakenTask, LandingClock, MAX_SCRIPTS, RESULT_GRACE } from "lib/worker"

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
	 * wider fleets. hostSpacing plus deadline chunking remove the merge
	 * almost entirely — measured implied backlog 0.04 at the 200k-script
	 * cap — so the default sits near zero; raise toward ~1 with chunking
	 * off, and toward ~7 with host spacing off too. The hack ledger's
	 * "implied backlog" is the live calibration. 0 disables the discount.
	 */
	backlogBatches = 0.05

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

	/**
	 * Deadline chunk spacing: chunk k of the wave (each chunk is chunkSize
	 * contiguous batches in exec order) lands chunkSpacing ms after chunk
	 * k-1. Host spacing segments the merge between hosts; this segments
	 * the timer-layer scramble inside a host segment, which at the 200k
	 * script cap displaces landings a median ~2300 scripts (implied
	 * backlog ~3.3) even though starts run in perfect exec order with
	 * positive margins. Tail cost is (batches/chunkSize) × chunkSpacing,
	 * and MAX_SCRIPTS/3 bounds batches, so the cost stays a fixed few
	 * seconds — unlike true per-batch staggering, which is forbidden.
	 * 0 disables.
	 * Validated at 100 batches / 5ms on the 200k-script cap: implied
	 * backlog fell 3.3 → 0.04, gain ratio 39% → 98.9%, landing-vs-exec
	 * displacement 2315 → 62, and the midwave tape reads pure hgw cycles.
	 */
	chunkSize = 100
	chunkSpacing = 5

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
		// One clock across all three tasks: every audit compares stamps
		// between the wave's hacks, grows, and weakens
		const clock = new LandingClock()
		for (const task of [hackTask, growTask, weakenTask]) {
			task.chunkBatches = this.chunkSize
			task.chunkMs = this.chunkSpacing
			task.clock = clock
		}
		const batchTask = new CompoundTask(hackTask, growTask, weakenTask)

		const results = await this.#pool.executeBatchTask(batchTask, this.#waveBudget(endTime))
		if (results === null) {
			this.#log.error("Wave never fully reported: %d/%d/%d hack/grow/weaken landings by the budget; "
				+ "continuing with what landed (scripts killed before starting never write their port)",
				hackTask.landings, growTask.landings, weakenTask.landings)
		} else {
			const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
			if (failures.length > 0) {
				this.#log.warn("%d of %d batch scripts failed to launch: %s",
					failures.length, results.length - 1, failures[0].reason)
			}
		}
		this.#logWaveStats(batch, hackTask, growTask, weakenTask)
		this.#logHackLedger(batch, hackTask, levelAtFire)
		this.#auditLandingOrder(hackTask, growTask, weakenTask)
		this.#auditDeadlineMargin(hackTask, growTask, weakenTask)
		this.#logLandingProfile(batch, hackTask, growTask)
		this.#auditHostBlocking(hackTask, growTask, weakenTask)
		this.#auditInterleave(hackTask, growTask, weakenTask)
		this.#auditStartOrder(hackTask, growTask, weakenTask)
		return hackTask.proceeds
	}

	/**
	 * The latest instant any script of this wave could still legitimately
	 * report: the base deadline, plus the last host's offset, plus the last
	 * chunk's step (overestimated from the batch cap, since the real batch
	 * count isn't known until after the launch loop), plus grace for the
	 * landing burst's processing lag. Bounds the pool's wait so a script
	 * that died before starting can't hang the wave forever.
	 */
	#waveBudget(endTime: number): number {
		const hostTail = this.hostSpacing * Math.max(this.#pool.workers.length - 1, 0)
		const chunkTail = this.chunkSize > 0
			? Math.ceil(MAX_SCRIPTS / 3 / this.chunkSize) * this.chunkSpacing
			: 0
		return endTime + hostTail + chunkTail + RESULT_GRACE
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
		const ratio = sized ? hackTask.proceeds / sized : 0
		// Inverts take = (1 - hackPercent)^L to report the backlog this wave
		// actually behaved like — the calibration to feed --backlog-batches.
		// It is scale-dependent: ~1 at 23k scripts with host spacing on,
		// ~3 at the 200k script cap.
		const p = batch.hackPercent
		const implied = ratio > 0 && ratio < 1 && p > 0 && p < 1
			? Math.log(ratio) / Math.log(1 - p) : null
		this.#log.info("Hack ledger: $%s gained of $%s sized server loss (%s gain ratio, implied backlog %s); "
			+ "hacking level %d at fire, %d now",
			f.number(hackTask.proceeds), f.number(sized), f.percent(ratio),
			implied === null ? "n/a" : f.number(implied),
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

	/**
	 * Compares the order scripts actually began running against the order
	 * the launch loop exec'd them, and landing order against exec order.
	 * The exec side is deterministic — pool order, then instance order,
	 * then h,g,w within a batch — and, because the exec loop is host-major
	 * and hostSpacing makes deadlines host-major, exec order IS the
	 * expected landing order. The game gives no such guarantee for starts:
	 * exec'd scripts begin on async module-load promise chains (bitburner-src
	 * NetscriptWorker.ts startNetscript2Script), so start order is the
	 * engine's choice. Healthy is start-vs-exec possibly noisy (self-timing
	 * absorbs start drift while margins stay positive) with landing-vs-exec
	 * near zero; landing-vs-exec tracking start-vs-exec means clamped
	 * scripts landed by start time instead of deadline (raise launch slack).
	 */
	#auditStartOrder(hackTask: HackTask, growTask: GrowTask, weakenTask: WeakenTask) {
		const tasks = [hackTask, growTask, weakenTask]
		const events: { start: number, stamp: number, execIdx: number, startRank: number, stampRank: number }[] = []
		for (let t = 0; t < tasks.length; t++) {
			for (let i = 0; i < tasks[t].launches; i++) {
				const start = tasks[t].startTimes[i]
				const stamp = tasks[t].landingOrder[i]
				if (start !== null && start !== undefined && stamp !== undefined) {
					events.push({ start, stamp, execIdx: i * 3 + t, startRank: 0, stampRank: 0 })
				}
			}
		}
		if (events.length < 2) {
			return
		}
		events.sort((a, b) => a.execIdx - b.execIdx)
		let inverted = 0
		for (let i = 1; i < events.length; i++) {
			if (events[i].start < events[i - 1].start) {
				inverted++
			}
		}
		const byStart = [...events].sort((a, b) => a.start - b.start || a.execIdx - b.execIdx)
		byStart.forEach((e, rank) => e.startRank = rank)
		const byStamp = [...events].sort((a, b) => a.stamp - b.stamp)
		byStamp.forEach((e, rank) => e.stampRank = rank)
		const spread = byStart[byStart.length - 1].start - byStart[0].start
		const startVsExec = this.#median(events.map((e, i) => Math.abs(e.startRank - i)))
		const landVsExec = this.#median(events.map((e, i) => Math.abs(e.stampRank - i)))
		this.#log.info("Start order: %d ms spread; %s of adjacent exec pairs started out of order; "
			+ "median displacement start-vs-exec %d, landing-vs-exec %d scripts",
			Math.round(spread), this.#ns.format.percent(inverted / (events.length - 1)),
			startVsExec, landVsExec)
	}

	#median(values: number[]): number {
		if (!values.length) {
			return 0
		}
		values.sort((a, b) => a - b)
		return values[values.length >> 1]
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