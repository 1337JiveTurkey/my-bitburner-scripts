import { NS } from "@ns"

const PORT_OPENERS = [
	"BruteSSH.exe",
	"FTPCrack.exe",
	"relaySMTP.exe",
	"HTTPWorm.exe",
	"SQLInject.exe"
]

export async function main(ns: NS) {
	if (!ns.serverExists("darkweb")) {
		if (ns.singularity.purchaseTor()) {
			ns.tprintf("Purchased Tor router")
		}
	}
	
	let purchasedProgram = false
	for (const program of PORT_OPENERS) {
		if (!ns.fileExists(program)) {
			const cost = ns.singularity.getDarkwebProgramCost(program)
			if (cost < ns.getPlayer().money) {
				if (ns.singularity.purchaseProgram(program)) {
					ns.tprintf("Purchased %s", program)
					purchasedProgram = true
				}
			}
		}
	}

	if (purchasedProgram) {
		ns.spawn("service.js", { spawnDelay: 100 }, "server-state.js")
	}
}