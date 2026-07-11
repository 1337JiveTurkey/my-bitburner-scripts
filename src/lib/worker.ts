import { NS } from "@ns"
import { getServerState } from "srv/server-state"

const HACK_WORKER = "workers/hack.js"
const GROW_WORKER = "workers/grow.js"
const WEAKEN_WORKER = "workers/weaken.js"
const SHARE_WORKER = "workers/share.js"
const CHARGE_WORKER = "workers/charge.js"

export const MAX_SCRIPTS = 200000

/**
 * How long past its last possible landing a wave's scripts get to report
 * before the pool stops waiting. Generous because port writes resolve only
 * as the landing burst is processed, which reaches tens of seconds at the
 * MAX_SCRIPTS scale.
 */
export const RESULT_GRACE = 60000

/**
 * What a hack/grow/weaken worker reports back on its port: the operation's
 * result, plus the deadline margin the script saw when it started. A negative
 * margin means the script could not make its endTime (its additionalMsec
 * clamped to zero) and landed that far late; null means no deadline was set.
 * started is performance.now() at the script's first statement — the game
 * begins exec'd scripts on async module-load promise chains, so actual start
 * order is the engine's choice and worth auditing against exec order.
 */
export interface WorkerResult {
	value: number
	margin: number | null
	started: number | null
}

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

	/**
	 * Milliseconds added to any deadline this worker's scripts are given.
	 * A wave lands as a fair merge of one in-order stream per host, so
	 * spacing hosts' deadlines apart segments the merge: each host's
	 * batches land contiguously in their own h/g/w order instead of a
	 * merge round away from each other.
	 */
	landingOffset = 0

	constructor(ns: NS, hostname: string, maxRam: number) {
		this.#ns = ns
		this.hostname = hostname
		this.maxRam = maxRam

		if (hostname !== "home") {
			try {
				ns.scp([HACK_WORKER, GROW_WORKER, WEAKEN_WORKER, SHARE_WORKER, CHARGE_WORKER], hostname)
			} catch {
				// Host may be gone since the state file was written; ram stays 0 so it's never scheduled
			}
		}
	}

	/**
	 * Calls the appropriate worker script with all the parameters provided
	 * by the caller and the Worker object. Returns a promise that completes
	 * when the script finishes. endTime is the absolute timestamp the script
	 * should finish at (0 = as soon as possible); the worker script pads its
	 * own run from its live duration to land on that deadline.
	 */
	async exec(tool: string,
	           target: string,
	           threads: number,
	           endTime: number,
	           stockType: string): Promise<WorkerResult> {
		const deadline = endTime ? endTime + this.landingOffset : endTime
		const pid: number = this.#ns.exec(tool,
		                                  this.hostname,
		                                  { threads: threads, temporary: true },
		                                  target,
		                                  deadline,
		                                  stockType === this.stock)
		if (pid) {
			return this.#ns.nextPortWrite(pid).then(() => {
				const payload = JSON.parse(String(this.#ns.readPort(pid)))
				const value = Number(payload?.result)
				const margin = payload?.margin
				const started = payload?.started
				// Only finite numbers may pass: the JSON round-trip turns
				// NaN/Infinity into null, and a foreign payload (a stray write
				// on this pid's port) has no margin field at all — undefined
				// slipping through here poisoned the wave margin aggregates
				// into NaN and blinded the deadline-slack audit.
				return {
					value: Number.isFinite(value) ? value : 0,
					margin: typeof margin === "number" && Number.isFinite(margin) ? margin : null,
					started: typeof started === "number" && Number.isFinite(started) ? started : null,
				}
			})
		} else {
			throw new Error("Failed to start " + tool)
		}
	}

	async hack(target: string, threads: number, endTime: number): Promise<WorkerResult> {
		return this.exec(HACK_WORKER, target, threads, endTime, "hack")
	}

	async grow(target: string, threads: number, endTime: number): Promise<WorkerResult> {
		return this.exec(GROW_WORKER, target, threads, endTime, "grow")
	}

	async weaken(target: string, threads: number, endTime: number): Promise<WorkerResult> {
		return this.exec(WEAKEN_WORKER, target, threads, endTime, "weaken")
	}

	async share(threads: number): Promise<void> {
		const pid: number = this.#ns.exec(SHARE_WORKER,
		                                  this.hostname,
		                                  { threads: threads, temporary: true })
		if (pid) {
			await this.#ns.nextPortWrite(pid)
			return this.#ns.readPort(pid)
		} else {
			throw new Error("Failed to start " + SHARE_WORKER)
		}
	}

	async charge(threads: number, params: [number, number][]): Promise<number> {
		const pid: number = this.#ns.exec(CHARGE_WORKER,
		                                  this.hostname,
		                                  { threads: threads, temporary: true },
		                                  JSON.stringify(params))
		if (pid) {
			await this.#ns.nextPortWrite(pid)
			return this.#ns.readPort(pid)
		} else {
			throw new Error("Failed to start " + CHARGE_WORKER)
		}
	}

	numberOfInstances(executableRam: number): number {
		return Math.floor(this.ram / executableRam)
	}

	get ram(): number {
		try {
			return this.#ns.getServerMaxRam(this.hostname) - this.#ns.getServerUsedRam(this.hostname)
		} catch {
			// Host may be gone since the state file was written
			return 0
		}
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
	 * Individual script failures are reported in the settled results rather
	 * than rejecting the whole batch. waitUntil bounds the wait (see #settle);
	 * null means it timed out.
	 */
	async executeBatchTask(task: WorkerTask, waitUntil = 0): Promise<PromiseSettledResult<any>[] | null> {
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
		return await this.#settle(promises, waitUntil)
	}

	/**
	 * Executes a task that scales its threads to use up available resources
	 * on the thread pool, up to maxScale copies of the task in total.
	 * waitUntil bounds the wait (see #settle); null means it timed out.
	 */
	async executeScalingTask(task: WorkerTask, maxScale: number = Infinity, waitUntil = 0): Promise<PromiseSettledResult<any>[] | null> {
		const promises: Promise<any>[] = [this.#ns.asleep(1000)]
		let remaining = maxScale
		for (const worker of this.workers) {
			const multiplier = Math.min(worker.numberOfInstances(task.ram), remaining)
			if (multiplier > 0) {
				task.execute(worker, promises, multiplier)
				remaining -= multiplier
			}
			if (remaining <= 0) {
				break
			}
		}
		return await this.#settle(promises, waitUntil)
	}

	/**
	 * Executes a task with no special behavior. waitUntil bounds the wait
	 * (see #settle); null means it timed out.
	 */
	async executeTask(task: WorkerTask, waitUntil = 0): Promise<PromiseSettledResult<any>[] | null> {
		const promises: Promise<any>[] = [this.#ns.asleep(1000)]
		for (const worker of this.workers) {
			const multiplier = worker.numberOfInstances(task.ram)
			if (multiplier) {
				task.execute(worker, promises, 1)
			}
		}
		return await this.#settle(promises, waitUntil)
	}

	/**
	 * Waits for every script's result, but never past waitUntil (0 = wait
	 * forever, the old behavior). A script killed before its atExit
	 * registers — the window is module load, before main()'s first
	 * statement — never writes its port, and one lost promise would hang
	 * the wave's allSettled forever. One shared timer bounds the whole
	 * wait: per-script timers would double the wave's timer count, which
	 * is real engine load at MAX_SCRIPTS scale. On timeout the caller gets
	 * null and proceeds with whatever landed — the tasks' own counters
	 * already hold every script that did report, and a straggler that
	 * reports later merely updates counters nobody reads again.
	 */
	async #settle(promises: Promise<any>[], waitUntil: number): Promise<PromiseSettledResult<any>[] | null> {
		const all = Promise.allSettled(promises)
		if (!waitUntil) {
			return await all
		}
		return await Promise.race([
			all,
			this.#ns.asleep(Math.max(waitUntil - Date.now(), 1000)).then(() => null),
		])
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
 * Monotonic stamp shared by every task, for observing the order scripts'
 * promises actually resolve in. Resolution order is a proxy for landing
 * order: it reflects when each worker's port write is processed, just after
 * its effect lands.
 */
let landingCounter = 0

/**
 * A task that involves executing a specific script, like hack, grow or weaken.
 * RAM is measured from the actual worker script so scheduling can never
 * diverge from what exec() will really consume.
 */
abstract class ExecutableTask implements WorkerTask {
	readonly baseRam: number
	readonly target: string
	readonly threads: number
	readonly endTime: number
	/** Total threads across every script this task has launched. */
	threadsLaunched = 0
	/** Scripts launched so far, which is also the next instance's index. */
	launches = 0
	/** Resolution-order stamp per instance, recorded as each script lands. */
	readonly landingOrder: number[] = []
	/** Scripts that reported starting too late to make the shared deadline. */
	clamped = 0
	/** Smallest deadline margin reported in ms; negative = landed that late. */
	minMargin: number | null = null
	/** Each instance's op return value (money, multiplier, or removed). */
	readonly outcomes: number[] = []
	/** Hostname each instance was launched on. */
	readonly hosts: string[] = []
	/** performance.now() at each instance's first statement, if reported. */
	readonly startTimes: (number | null)[] = []
	/**
	 * Deadline chunking: every chunkBatches instances the deadline steps
	 * chunkMs later. The timer layer scrambles landings within a host
	 * segment (measured: starts in perfect exec order, positive margins,
	 * landings still displaced thousands of scripts) but respects expiry
	 * order, so stepping the deadline per chunk segments that scramble the
	 * way per-host offsets segment the host merge. 0 disables.
	 */
	chunkBatches = 0
	chunkMs = 0

	protected constructor(ns: NS, script: string, target: string, threads: number, endTime: number) {
		this.baseRam = ns.getScriptRam(script)
		if (!this.baseRam) {
			throw new Error(script + " is missing on " + ns.self().server + " so its RAM can't be measured")
		}
		this.target = target
		this.threads = threads
		this.endTime = endTime
	}

	get ram(): number {
		return this.threads * this.baseRam
	}

	protected deadline(instance: number): number {
		if (!this.endTime || !this.chunkBatches || !this.chunkMs) {
			return this.endTime
		}
		return this.endTime + Math.floor(instance / this.chunkBatches) * this.chunkMs
	}

	protected land(instance: number, res: WorkerResult) {
		this.landingOrder[instance] = ++landingCounter
		this.outcomes[instance] = res.value
		this.startTimes[instance] = res.started
		if (res.margin !== null) {
			if (res.margin < 0) {
				this.clamped++
			}
			if (this.minMargin === null || res.margin < this.minMargin) {
				this.minMargin = res.margin
			}
		}
	}

	abstract execute(worker: Worker, promises: Promise<any>[], scaling: number): void;
}

export class HackTask extends ExecutableTask {
	/** Money stolen so far by every script this task has launched. */
	proceeds = 0
	/** Scripts that have finished. */
	landings = 0
	/** Scripts whose hack failed and stole nothing. */
	failures = 0

	constructor(ns: NS, target: string, threads: number, endTime: number) {
		super(ns, HACK_WORKER, target, threads, endTime)
	}

	execute(worker: Worker, promises: Promise<any>[], scaling: number) {
		const instance = this.launches++
		this.hosts[instance] = worker.hostname
		this.threadsLaunched += this.threads * scaling
		promises.push(worker.hack(this.target, this.threads * scaling, this.deadline(instance))
			.then(res => {
				this.land(instance, res)
				this.proceeds += res.value
				this.landings++
				if (!res.value) {
					this.failures++
				}
			}))
	}
}

export class GrowTask extends ExecutableTask {
	/** Scripts that have finished. */
	landings = 0
	/** Scripts that landed on an already-full server and grew nothing. */
	noops = 0

	constructor(ns: NS, target: string, threads: number, endTime: number) {
		super(ns, GROW_WORKER, target, threads, endTime)
	}

	execute(worker: Worker, promises: Promise<any>[], scaling: number) {
		const instance = this.launches++
		this.hosts[instance] = worker.hostname
		this.threadsLaunched += this.threads * scaling
		promises.push(worker.grow(this.target, this.threads * scaling, this.deadline(instance))
			.then(res => {
				this.land(instance, res)
				this.landings++
				if (res.value < 1.0001) {
					this.noops++
				}
			}))
	}
}

export class WeakenTask extends ExecutableTask {
	/** Scripts that have finished. */
	landings = 0
	/** Security actually removed, which is 0 when landing on a floored server. */
	reduced = 0

	constructor(ns: NS, target: string, threads: number, endTime: number) {
		super(ns, WEAKEN_WORKER, target, threads, endTime)
	}

	execute(worker: Worker, promises: Promise<any>[], scaling: number) {
		const instance = this.launches++
		this.hosts[instance] = worker.hostname
		this.threadsLaunched += this.threads * scaling
		promises.push(worker.weaken(this.target, this.threads * scaling, this.deadline(instance))
			.then(res => {
				this.land(instance, res)
				this.landings++
				this.reduced += res.value
			}))
	}
}
