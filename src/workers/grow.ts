import { NS } from "@ns"

export async function main(ns: NS) {
	// First statement, so the stamp is as close to "main began" as possible:
	// the game starts exec'd scripts on async module-load promise chains, so
	// start order is the engine's choice, not exec order. Sub-ms and RAM-free.
	const started = performance.now()
	ns.disableLog("ALL")
	const hostname = ns.args[0].toString()
	const endTime = Number(ns.args[1] || 0)
	const stock = !!ns.args[2]

	let result = 1
	let margin: number | null = null
	ns.atExit(() => ns.writePort(ns.pid, JSON.stringify({ result, margin, started })))
	// Self-time toward the absolute deadline using the live duration, so the
	// landing order survives any drift between scheduling and starting. A
	// negative margin means this script started too late to make the deadline
	// and lands that far past it instead; it's reported back so the executor
	// can size its launch slack off the fleet's real launch spread.
	if (endTime) {
		margin = endTime - Date.now() - ns.getGrowTime(hostname)
	}
	result = await ns.grow(hostname, { additionalMsec: Math.max(margin ?? 0, 0), stock: stock })
}
