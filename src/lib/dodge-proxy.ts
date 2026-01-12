import {NS} from "@ns"

/**
 * A proxy function that's used to call this dodged script with the appropriate
 * arguments and return value. If the proxy is imported by itself the RAM costs
 * should be limited to those used in this function.
 *
 * @param scriptName The name of the script with the directory and extension.
 */
export default function dodgedProxy<P, R>(scriptName: string): (ns: NS, params: P) => Promise<R> {
	return async (ns: NS, params: P) => {
		const p = JSON.stringify(params)
		const pid = ns.run(scriptName, {temporary: true}, p)
		if (pid) {
			await ns.nextPortWrite(pid)
			return ns.readPort(pid) as R
		} else {
			throw new Error(`Couldn't start ${scriptName} process.`)
		}
	}
}