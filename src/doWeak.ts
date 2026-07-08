import { NS } from "@ns"

export async function main(ns: NS) {
	const params = JSON.parse(ns.args[0] as string)

	if ("delay" in params) {
		await ns.weaken(params.target, {additionalMsec: params.delay})
	} else {
		await ns.weaken(params.target)
	}
	ns.writePort(ns.pid, "Finished")
}
