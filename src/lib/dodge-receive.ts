import {NS} from "@ns"
import Log from "lib/logging"

/**
 * Drains a dodged script's PID port and returns the payload of its
 * {tag:"success"} message. A {tag:"error"} message throws instead, so a
 * caller never blocks on a child that crashed or was killed. Any {tag:"log"}
 * messages are forwarded to the supplied Log, so a caller can stream a
 * child's logs into its own sink; when no Log is given (fire-and-forget
 * callers) they are simply discarded.
 *
 * The port is drained fully on each wake rather than one message per
 * nextPortWrite. A child emits its logs and then its result synchronously and
 * exits, so reading a single message per notification would strand the backlog
 * behind an nextPortWrite that never comes.
 */
export default async function receiveMessages<R>(ns: NS, pid: number, log?: Log): Promise<R> {
	while (true) {
		let message = ns.readPort(pid)
		while (message !== "NULL PORT DATA") {
			if (message.tag === "success") {
				return message.result as R
			} else if (message.tag === "error") {
				throw new Error(message.message)
			} else if (message.tag === "log" && log) {
				log.logInternal(message.level, message.format, message.args)
			}
			message = ns.readPort(pid)
		}
		await ns.nextPortWrite(pid)
	}
}
