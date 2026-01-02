import { NS } from "@ns"

export async function main(ns: NS) {
	ns.disableLog("ALL")
	let result = 0
	ns.atExit(() => ns.writePort(ns.pid, result))
	const params: [number, number][] = JSON.parse(ns.args[0].toString())
	for (const [x, y] of params) {
		await ns.stanek.chargeFragment(x, y)
		result++
	}
}