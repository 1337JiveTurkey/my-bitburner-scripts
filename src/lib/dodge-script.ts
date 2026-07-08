import {NS} from "@ns"
import Log from "lib/logging"

/**
 * Wraps a function so that it can be exported as the entry point of a script.
 * The wrapped function takes an object that contains all of its parameters
 * and returns an object that contains all of its return values.
 *
 * The wrapper also hands the body a Log wired to the script's own PID port, so
 * anything it logs is streamed back to the caller (see DodgeInterface). The
 * child emits at the most verbose level; the caller's Log re-gates by its own
 * configured level, so nothing is lost by emitting everything here.
 *
 * @param realMain The body of the function as a lambda.
 */
export default function dodgedMain<P, R>(realMain: (ns: NS, params: P, log: Log) => Promise<R>): (ns: NS) => Promise<void> {
	return async (ns: NS) => {
		if (ns.args.length !== 1) {
			throw new Error("Wrong number of args given. Was this called manually?")
		}
		// The caller blocks on this port, so every exit path must write to it —
		// including being killed mid-await, which only atExit can observe.
		let reported = false
		ns.atExit(() => {
			if (!reported) {
				ns.writePort(ns.pid, {
					tag: "error",
					message: ns.self().filename + " exited without returning a result"
				})
			}
		})
		try {
			const params = JSON.parse(ns.args[0].toString()) as P
			const log = new Log(ns).toPort(ns.pid).level("FINER")
			const result = await realMain(ns, params, log)
			reported = true
			ns.writePort(ns.pid, {
				tag: "success",
				result
			})
		} catch (err) {
			reported = true
			ns.writePort(ns.pid, {
				tag: "error",
				message: String(err)
			})
		}
	}
}