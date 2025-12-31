import { NS } from "@ns"

export async function main(ns: NS) {
	const params: [number, number][] = JSON.parse(ns.args[0].toString())
	do {
		for (const [x, y] of params) {
			await ns.stanek.chargeFragment(x, y)
		}
	} while (true)
}