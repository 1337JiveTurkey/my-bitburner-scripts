import { NS } from "@ns"

/** @param {NS} ns */
export async function main(ns) {
	const params = JSON.parse(ns.args[0])

	if ("delay" in params) {
		await ns.weaken(params.target, {additionalMsec: params.delay})
	} else {
		await ns.weaken(params.target)
	}
	ns.writePort(ns.pid, "Finished")
}