import { NS } from "@ns"

/**
 * Class that runs the StateService interface instead of doing this
 * as an abstract class.
 */
export default class ServiceRunner<T> {
	readonly ns: NS
	readonly portNumber: number
	readonly service: StateService<T>

	constructor(ns: NS, service: StateService<T>) {
		this.ns = ns
		this.portNumber = ns.pid
		this.service = service
	}

	/**
	 * Starts the service.
	 */
	async start(): Promise<never> {
		do {
			const stateData = this.service.calculateState()

			
			const portWritten = await Promise.race([
				this.ns.asleep(60 * 1000).then(_ => false),
				this.ns.nextPortWrite(this.portNumber).then(_ => true)])
			if (portWritten) {
				const data = this.ns.readPort(this.portNumber)
			}
		} while (true)
	}
}

interface StateService<T> {
	readonly stateFile: string
	calculateState(): T
}