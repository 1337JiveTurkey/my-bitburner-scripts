import { NS } from "@ns"

export async function main(ns: NS) {
	// First statement, so the stamp is as close to "main began" as possible:
	// the game starts exec'd scripts on async module-load promise chains, so
	// start order is the engine's choice, not exec order. Sub-ms and RAM-free.
	const started = performance.now()
	let result = 0
	let margin: number | null = null
	// Registered before anything that can throw (arg parsing included): the
	// pool is waiting on this port, so a script that dies without writing it
	// would otherwise strand the whole wave.
	ns.atExit(() => ns.writePort(ns.pid, JSON.stringify({ result, margin, started })))
	ns.disableLog("ALL")
	const hostname = ns.args[0].toString()
	const endTime = Number(ns.args[1] || 0)
	const stock = !!ns.args[2]
	// Self-time toward the absolute deadline using the live duration, so the
	// landing order survives any drift between scheduling and starting. A
	// negative margin means this script started too late to make the deadline
	// and lands that far past it instead; it's reported back so the executor
	// can size its launch slack off the fleet's real launch spread.
	if (endTime) {
		margin = endTime - Date.now() - ns.getHackTime(hostname)
	}
	result = await ns.hack(hostname, { additionalMsec: Math.max(margin ?? 0, 0), stock: stock })
}
