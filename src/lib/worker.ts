import { NS } from "@ns"
import { getServerState } from "srv/server-state"

const HACK_WORKER = "workers/hack.js"
const GROW_WORKER = "workers/grow.js"
const WEAKEN_WORKER = "workers/weaken.js"
const SHARE_WORKER = "workers/share.js"

const MAX_SCRIPTS = 200000

/**
 * Worker that runs on a given host with various worker scripts. The methods
 * on a worker can be directly invoked or a WorkerTask can be passed in with
 * the parameters on the WorkerPool.
 */
export class Worker {
	#ns: NS
	readonly hostname: string
	readonly maxRam: number

	stock: "grow"|"hack"|null = null

	constructor(ns: NS, hostname: string, maxRam: number) {
		this.#ns = ns
		this.hostname = hostname
		this.maxRam = maxRam

		if (hostname !== "home") {
			ns.scp([HACK_WORKER, GROW_WORKER, WEAKEN_WORKER, SHARE_WORKER], hostname)
		}
	}

	/**
	 * Calls the appropriate worker script with all the parameters provided
	 * by the caller and the Worker object. Returns a promise that completes
	 * when the script finishes.
	 */
	async exec(tool: string,
	           target: string,
	           threads: number,
	           delay: number,
	           stockType: string): Promise<number> {
		const pid = this.#ns.exec(tool,
		                                  this.hostname,
		                                  { threads: threads, temporary: true },
		                                  target,
		                                  delay,
		                                  stockType === this.stock)
		if (pid) {
			return this.#ns.nextPortWrite(pid).then(() => this.#ns.readPort(pid))
		} else {
			throw new Error("Failed to start " + tool)
		}
	}

	async hack(target: string, threads: number, delay: number): Promise<number> {
		return this.exec(HACK_WORKER, target, threads, delay, "hack")
	}

	async grow(target: string, threads: number, delay: number): Promise<number> {
		return this.exec(GROW_WORKER, target, threads, delay, "grow")
	}

	async weaken(target: string, threads: number, delay: number): Promise<number> {
		return this.exec(WEAKEN_WORKER, target, threads, delay, "weaken")
	}

	async share(threads: number): Promise<void> {
		const pid = this.#ns.exec(SHARE_WORKER,
		                                  this.hostname,
		                                  { threads: threads, temporary: true })
		if (pid) {
			await this.#ns.nextPortWrite(pid)
			return this.#ns.readPort(pid)
		} else {
			throw new Error("Failed to start " + SHARE_WORKER)
		}
	}

	numberOfInstances(executableRam: number): number {
		return Math.floor(this.ram / executableRam)
	}

	get ram(): number {
		return this.#ns.getServerMaxRam(this.hostname) - this.#ns.getServerUsedRam(this.hostname)
	}
}

/**
 * Pool of workers that can be allocated to various tasks by using a
 * WorkerTask on the appropriate method.
 */
export class WorkerPool {
	readonly #ns: NS
	readonly workers: Worker[] = []

	constructor(ns: NS) {
		this.#ns = ns
		// TODO More flexibility in selecting servers
		const servers = getServerState(ns).filter(s => s.isHome || s.isPserv || s.isHacked)
		for (const server of servers) {
			this.workers.push(new Worker(ns, server.hostname, server.maxRam))
		}
	}

	/**
	 * Executes a task by creating as many copies of it as the pool can handle.
	 */
	async executeBatchTask(task: WorkerTask): Promise<any> {
		const promises: Promise<any>[] = [this.#ns.asleep(1000)]
w:		for (const worker of this.workers) {
			const multiplier = worker.numberOfInstances(task.ram)
			for (let i = 0; i < multiplier; i++) {
				task.execute(worker, promises, 1)
				if (promises.length > MAX_SCRIPTS) {
					break w
				}
			}
		}
		return await Promise.all(promises)
	}

	/**
	 * Executes a task that scales its threads to use up all available
	 * resources on the thread pool.
	 */
	async executeScalingTask(task: WorkerTask): Promise<any> {
		const promises: Promise<any>[] = [this.#ns.asleep(1000)]
		for (const worker of this.workers) {
			const multiplier = worker.numberOfInstances(task.ram)
			if (multiplier) {
				task.execute(worker, promises, multiplier)
			}
		}
		return await Promise.all(promises)
	}

	/**
	 * Executes a task with no special behavior.
	 */
	async executeTask(task: WorkerTask): Promise<any> {
		const promises: Promise<any>[] = [this.#ns.asleep(1000)]
		for (const worker of this.workers) {
			const multiplier = worker.numberOfInstances(task.ram)
			if (multiplier) {
				task.execute(worker, promises, 1)
			}
		}
		return await Promise.all(promises)
	}

	numberOfInstances(executableRam: number): number {
		let total = 0
		for (const worker of this.workers) {
			total += worker.numberOfInstances(executableRam)
		}		
		return total
	}

	get ram(): number {
		let total = 0
		for (const worker of this.workers) {
			total += worker.ram
		}		
		return total
	}

	set stock(stock: "grow"|"hack"|null) {
		for (const worker of this.workers) {
			worker.stock = stock
		}
	}
}

/**
 * A task that can be passed to a worker pool to execute.
 */
export interface WorkerTask {
	/**
	 * The amount of RAM that this task takes up on a host.
	 */
	readonly ram: number

	execute(worker: Worker, promises: Promise<any>[], scaling: number): void
}

/**
 * A task that consists of several other tasks that must be executed together
 * like a batch or executed in a given ratio.
 */
export class CompoundTask implements WorkerTask {	
	readonly tasks: WorkerTask[]

	constructor(...tasks: WorkerTask[]) {
		this.tasks = tasks
	}

	get ram(): number {
		let total = 0
		for (const task of this.tasks) {
			total += task.ram
		}
		return total
	}

	execute(worker: Worker, promises: Promise<any>[], scaling: number): void {
		for (const task of this.tasks) {
			task.execute(worker, promises, scaling)
		}
	}
}

/**
 * A task that involves executing a specific script, like hack, grow or weaken.
 */
abstract class ExecutableTask implements WorkerTask {
	abstract readonly baseRam: number
	readonly target: string
	readonly threads: number
	readonly delay: number

	protected constructor(target: string, threads: number, delay: number) {
		this.target = target
		this.threads = threads
		this.delay = delay
	}

	get ram(): number {
		return this.threads * this.baseRam
	}

	abstract execute(worker: Worker, promises: Promise<any>[], scaling: number): void;
}

export class HackTask extends ExecutableTask {
	readonly baseRam: number = 1.70

	constructor(target: string, threads: number, delay: number) {
		super(target, threads, delay)
	}
	execute(worker: Worker, promises: Promise<any>[], scaling: number) {
		promises.push(worker.hack(this.target, this.threads * scaling, this.delay))
	}
}

export class GrowTask extends ExecutableTask {
	readonly baseRam: number = 1.75

	constructor(target: string, threads: number, delay: number) {
		super(target, threads, delay)
	}
	execute(worker: Worker, promises: Promise<any>[], scaling: number) {
		promises.push(worker.grow(this.target, this.threads * scaling, this.delay))
	}
}

export class WeakenTask extends ExecutableTask {
	readonly baseRam: number = 1.75

	constructor(target: string, threads: number, delay: number) {
		super(target, threads, delay)
	}
	execute(worker: Worker, promises: Promise<any>[], scaling: number) {
		promises.push(worker.weaken(this.target, this.threads * scaling, this.delay))
	}
}
