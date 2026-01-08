import {NS} from "@ns"

/**
 * Wraps a function so that it can be exported as the entry point of a script.
 * The wrapped function takes an object that contains all of its parameters
 * and returns an object that contains all of its return values.
 *
 * @param realMain The body of the function as a lambda.
 */
export function dodgedMain<P, R>(realMain: (ns: NS, params: P) => Promise<R>): (ns: NS) => Promise<void> {
	return async (ns: NS) => {
		if (ns.args.length !== 1) {
			throw new Error("Wrong number of args given. Was this called manually?")
		}
		const params = JSON.parse(ns.args[0].toString()) as P
		const result = await realMain(ns, params)
		ns.writePort(ns.pid, result)
	}
}

/**
 * A proxy function that's used to call this dodged script with the appropriate
 * arguments and return value. If the proxy is imported by itself the RAM costs
 * should be limited to those used in this function.
 *
 * @param scriptName The name of the script with the directory and extension.
 */
export function dodgedProxy<P, R>(scriptName: string): (ns: NS, params: P) => Promise<R> {
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