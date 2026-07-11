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
	 * Milliseconds between consecutive hosts' deadlines. A wave lands as a
	 * fair merge of one in-order stream per host, leaving a standing
	 * backlog of unhealed hacks that taxes every take; spacing hosts'
	 * deadlines segments the merge back into whole host streams. Expiry
	 * order dominates the interleave, so segmentation holds even when the
	 * engine processes a host's landings slower than the spacing. Costs
	 * hosts × spacing of added tail — fixed in fleet size, unlike the
	 * per-batch spacing the design forbids. 0 keeps one shared deadline.
	 */
	hostSpacing = 0

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

		return bestBatch
	}

	estimateTotal(batch: BatchStats): number {
		const ramLimited = this.#pool.numberOfInstances(batch.batchRam)
		const countLimited = MAX_SCRIPTS / 3
		const batches = Math.min(ramLimited, countLimited)
		return batch.hackMoney * batches
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
		return hackTask.proceeds
	}

	/**
	 * Compares what the wave was sized to steal against what the hacks paid
	 * out. proceeds is the player's gain, which BitNode ScriptHackMoneyGain
	 * scales down from the server's loss — so the ratio sits at that
	 * multiplier (~0.97 here) when hacks land exactly as sized. Watch for
	 * movement in the ratio, not its absolute value: a drop means hacks
	 * landed on a poorer server than sizing assumed, and a level jump at a
	 * flat ratio means sizing kept up.
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
	 * proof, of out-of-order landings.
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
	 * Reports what actually landed, to tell the failure modes apart: weakens
	 * that removed ~nothing landed on a floored server (before the grows);
	 * no-op grows landed on a full server (before the hacks); failed hacks
	 * landed on a hardened server. A consistent ledger with a bad end state
	 * means some other script is changing the server outside this wave.
	 */
	#logWaveStats(batch: BatchStats, hackTask: HackTask, growTask: GrowTask, weakenTask: WeakenTask) {
		const f = this.#ns.format
		const s = this.#ns.getServer(batch.target.hostname)
		const secAdded = batch.target.secPerHack * batch.hackThreads * (hackTask.landings - hackTask.failures)
			+ batch.target.secPerGrow * batch.growThreads * growTask.landings
		const weakenPotential = batch.target.secPerWeak * batch.weakThreads * weakenTask.landings
		this.#log.info("Wave stats: %d batches of %dh/%dg/%dw; failed hacks %d/%d; no-op grows %d/%d; "
			+ "weakened %s of %s potential vs %s added; end security %s (min %s), money %s",
			weakenTask.landings, batch.hackThreads, batch.growThreads, batch.weakThreads,
			hackTask.failures, hackTask.landings,
			growTask.noops, growTask.landings,
			f.number(weakenTask.reduced), f.number(weakenPotential), f.number(secAdded),
			f.number(s.hackDifficulty ?? -1), f.number(s.minDifficulty ?? -1),
			f.percent((s.moneyAvailable ?? 0) / (s.moneyMax || 1)))
	}

}