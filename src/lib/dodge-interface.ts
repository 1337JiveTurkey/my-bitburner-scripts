import {NS} from "@ns"
import Log from "/lib/logging";

/**
 * Dodging interface that allows for logging across the run.
 */
export default class DodgeInterface {
	readonly ns: NS
	readonly log: Log

	constructor(ns: NS, log: Log) {
		this.ns = ns
		this.log = log
	}

	protected async dodgeCall<P, R>(params: P, scriptName: string): Promise<R> {
		const p = JSON.stringify(params)
		const pid: number = this.ns.run(scriptName, {temporary: true}, p)
		if (pid) {
			return await this.messages(pid)
		} else {
			throw new Error(`Couldn't start ${scriptName} process.`)
		}
	}

	protected async messages<R>(pid: number): Promise<R> {
		while (true) {
			await this.ns.nextPortWrite(pid)
			const message = this.ns.readPort(pid)
			const tag = message.tag
			if (tag === "success") {
				return message.result as R
			}
			else if (tag === "log") {
				this.log.logInternal(message.level, message.format, message.args)
			}
		}
	}
}