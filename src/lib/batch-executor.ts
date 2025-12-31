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
		this.#log.info("Created BatchExecutor with " + this.#pool.workers.length + " workers.")
	}

	async runOnWorkers(batch: BatchStats) {
		const target = batch.target
		const hostname = target.hostname
		this.#log.info("Targeting " + hostname)

		const batchTask = new CompoundTask(
			new HackTask(hostname, batch.hackThreads, target.hackDelay),
			new GrowTask(hostname, batch.growThreads, target.growDelay),
			new WeakenTask(hostname, batch.weakThreads, 0)
		)

		await this.#pool.executeBatchTask(batchTask)
	}

}