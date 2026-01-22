import { NS } from "@ns"
import Log from "lib/logging"
import { TargetStats, BatchStats } from "lib/batch-stats"
import { WorkerPool, CompoundTask, HackTask, GrowTask, WeakenTask } from "lib/worker"

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
		const countLimited = 200000 / 3
		const batches = Math.min(ramLimited, countLimited)
		return batch.hackMoney * batches
	}

	async runOnWorkers(batch: BatchStats) {
		const target = batch.target
		const hostname = target.hostname
		this.#log.fine("Targeting %s with %s", hostname, this.#ns.formatPercent(batch.hackPercent))

		const batchTask = new CompoundTask(
			new HackTask(hostname, batch.hackThreads, target.hackDelay),
			new GrowTask(hostname, batch.growThreads, target.growDelay),
			new WeakenTask(hostname, batch.weakThreads, 0)
		)

		await this.#pool.executeBatchTask(batchTask)
	}

}