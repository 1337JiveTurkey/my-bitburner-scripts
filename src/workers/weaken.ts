import { NS } from "@ns"

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const hostname = ns.args[0].toString()
	const endTime = Number(ns.args[1] || 0)
	const stock = !!ns.args[2]

	let result = 0
	ns.atExit(() => ns.writePort(ns.pid, result))
	// Self-time toward the absolute deadline using the live duration, so the
	// landing order survives any drift between scheduling and starting.
	const additionalMsec = Math.max(endTime - Date.now() - ns.getWeakenTime(hostname), 0)
	result = await ns.weaken(hostname, { additionalMsec: additionalMsec, stock: stock })
}