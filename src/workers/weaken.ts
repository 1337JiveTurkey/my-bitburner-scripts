import { NS } from "@ns"

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const hostname = ns.args[0].toString()
	const delay = Number(ns.args[1] || 0)
	const stock = !!ns.args[2]

	let result = 0
	ns.atExit(() => ns.writePort(ns.pid, result))
	result = await ns.weaken(hostname, { additionalMsec: delay, stock: stock })
}