import { NS } from "@ns"

export async function main(ns: NS) {
	ns.disableLog("ALL")

	const result = await ns.share()
	ns.atExit(() => ns.writePort(ns.pid, result))
}