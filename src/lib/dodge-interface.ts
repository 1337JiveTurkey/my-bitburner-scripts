import {NS} from "@ns"
import Log from "/lib/logging";
import receiveMessages from "lib/dodge-receive";

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
			return await receiveMessages<R>(this.ns, pid, this.log)
		} else {
			throw new Error(`Couldn't start ${scriptName} process.`)
		}
	}
}