import {NS} from "@ns"

/**
 * Wraps a function so that it can be exported as the entry point of a script.
 * The wrapped function takes an object that contains all of its parameters
 * and returns an object that contains all of its return values.
 *
 * @param realMain The body of the function as a lambda.
 */
export default function dodgedMain<P, R>(realMain: (ns: NS, params: P) => Promise<R>): (ns: NS) => Promise<void> {
	return async (ns: NS) => {
		if (ns.args.length !== 1) {
			throw new Error("Wrong number of args given. Was this called manually?")
		}
		const params = JSON.parse(ns.args[0].toString()) as P
		const result = await realMain(ns, params)
		ns.writePort(ns.pid, {
			tag: "success",
			result
		})
	}
}