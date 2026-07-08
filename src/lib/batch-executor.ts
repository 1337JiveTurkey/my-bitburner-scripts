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
	 */
	async runOnWorkers(batch: BatchStats): Promise<number> {
		const target = batch.target
		const hostname = target.hostname
		this.#log.fine("Targeting %s with %s", hostname, this.#ns.format.percent(batch.hackPercent))

		const endTime = Date.now() + this.#ns.getWeakenTime(hostname)
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
		return hackTask.proceeds
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
		this.#log.info("Wave stats: %d batches; failed hacks %d/%d; no-op grows %d/%d; "
			+ "weakened %s of %s potential vs %s added; end security %s (min %s), money %s",
			weakenTask.landings,
			hackTask.failures, hackTask.landings,
			growTask.noops, growTask.landings,
			f.number(weakenTask.reduced), f.number(weakenPotential), f.number(secAdded),
			f.number(s.hackDifficulty ?? -1), f.number(s.minDifficulty ?? -1),
			f.percent((s.moneyAvailable ?? 0) / (s.moneyMax || 1)))
	}

}