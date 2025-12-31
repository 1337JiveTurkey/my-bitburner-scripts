import { NS } from "@ns"

export async function main(ns: NS) {
	await ns.stanek.chargeFragment(Number(ns.args[0]), Number(ns.args[1]))
	ns.atExit(() => ns.writePort(ns.pid, "Finished"))
}