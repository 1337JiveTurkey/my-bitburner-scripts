import {NS} from "@ns"
import receiveMessages from "lib/dodge-receive"

/**
 * A proxy function that's used to call this dodged script with the appropriate
 * arguments and return value. If the proxy is imported by itself the RAM costs
 * should be limited to those used in this function.
 *
 * This is the fire-and-forget counterpart to DodgeInterface: it shares the same
 * {tag:"success"} envelope and drain logic (via receiveMessages) but has no Log
 * to forward the child's {tag:"log"} messages to, so those are discarded.
 *
 * @param scriptName The name of the script with the directory and extension.
 */
export default function dodgedProxy<P, R>(scriptName: string): (ns: NS, params: P) => Promise<R> {
	return async (ns: NS, params: P) => {
		const p = JSON.stringify(params)
		const pid = ns.run(scriptName, {temporary: true}, p)
		if (pid) {
			return await receiveMessages<R>(ns, pid)
		} else {
			throw new Error(`Couldn't start ${scriptName} process.`)
		}
	}
}