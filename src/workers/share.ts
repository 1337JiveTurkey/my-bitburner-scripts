import { NS } from "@ns"

export async function main(ns: NS) {
	ns.disableLog("ALL")

	let result = false
	ns.atExit(() => ns.writePort(ns.pid, result))
	await ns.share()
	result = true
}