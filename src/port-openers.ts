import { NS, ProgramName } from "@ns"

const PORT_OPENERS: ProgramName[] = [
	"BruteSSH.exe",
	"FTPCrack.exe",
	"relaySMTP.exe",
	"HTTPWorm.exe",
	"SQLInject.exe"
]

export async function main(ns: NS) {
	// The darkweb server now exists before Tor is bought, so serverExists()
	// is no longer a valid ownership check
	if (!ns.hasTorRouter()) {
		if (ns.singularity.purchaseTor()) {
			ns.tprintf("Purchased Tor router")
		} else {
			ns.tprintf("ERROR: Couldn't purchase the Tor router")
			return
		}
	}

	let purchasedProgram = false
	for (const program of PORT_OPENERS) {
		if (!ns.fileExists(program)) {
			const cost = ns.singularity.getDarkwebProgramCost(program)
			if (cost > ns.getPlayer().money) {
				ns.tprintf("Skipping %s, costs %s", program, ns.format.number(cost))
			} else if (ns.singularity.purchaseProgram(program)) {
				ns.tprintf("Purchased %s", program)
				purchasedProgram = true
			} else {
				ns.tprintf("ERROR: Failed to purchase %s", program)
			}
		}
	}

	if (purchasedProgram) {
		ns.spawn("service.js", { spawnDelay: 100 }, "server-state.js")
	}
}