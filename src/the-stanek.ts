import { NS } from "@ns"
import { getServerState, ServerState } from "srv/server-state"

export async function main(ns: NS) {
	const c: coordinates = []
	for (const activeFragment of ns.stanek.activeFragments()) {
		// And thus the problem was solved Once and For All
		if (activeFragment.id < 100) {
			c.push([activeFragment.x, activeFragment.y])
		}
	}
	const param = JSON.stringify(c)
	const jsonServers = getServerState(ns).filter(s => s.isPserv)
	for (const server of jsonServers) {
		charge(ns, server, param)
	}
}

type coordinates = [number, number][]

function charge(ns: NS, server: ServerState, param: string): boolean {
	const maxRam = server.maxRam
	let usedRam = ns.getServerUsedRam(server.hostname)
	// Only run this on empty servers we've hacked into
	if (usedRam) {
		ns.killall(server.hostname)
//		return false
	}
	usedRam = ns.getServerUsedRam(server.hostname)
	const scriptCost = ns.getScriptRam("doChargeGrid.js")
	const threads = Math.floor((maxRam - usedRam) / scriptCost)
	if (Number.isSafeInteger(threads)) {
		ns.scp("doChargeGrid.js", server.hostname)
		const pid = ns.exec("doChargeGrid.js", server.hostname, threads, param)
		if (pid) {
			return true
		}
	}
	return false
}