import {NS, Server} from "@ns"
import dodgedMain from "lib/dodge-script"
import {OpenPortsParams, OpenPortsResults} from "lib/servers/interface"

const PORT_OPENERS = [
	"BruteSSH.exe",
	"FTPCrack.exe",
	"relaySMTP.exe",
	"HTTPWorm.exe",
	"SQLInject.exe"
]

export const main = dodgedMain<OpenPortsParams, OpenPortsResults>(async (ns: NS, p: OpenPortsParams) => {
	const budget = p.budget
	let budgetRemaining = budget? budget: ns.getPlayer().money

	if (!ns.hasTorRouter()) {
		if (budgetRemaining >= 200000 && ns.singularity.purchaseTor()) {
			ns.tprintf("Purchased Tor router")
			budgetRemaining -= 200000
		}
	}

	let purchasedProgram = false
	for (const program of PORT_OPENERS) {
		if (!ns.fileExists(program)) {
			const cost = ns.singularity.getDarkwebProgramCost(program)
			if (cost < budgetRemaining) {
				if (ns.singularity.purchaseProgram(program)) {
					ns.tprintf("Purchased %s", program)
					budgetRemaining -= cost
					purchasedProgram = true
				}
			}
		}
	}
	for (const hostname of recursiveScan(ns)) {
		const server = ns.getServer(hostname)
		soften(ns, server)

	}
	return {
		openedServers: [""],
		canOpenMore: true
	}
})

function recursiveScan(ns: NS): string[] {
	const hostnames = new Set<string>()
	recurse(ns, ns.self().server, hostnames)
	return [...hostnames]
}

function recurse(ns: NS, hostname: string, hostnames: Set<string>) {
	if (!hostnames.has(hostname)) {
		hostnames.add(hostname)
		for (const child of ns.scan(hostname)) {
			recurse(ns, child, hostnames)
		}
	}
}

/**
 *  Pound the server's ports into submission. Doesn't matter how many ports
 *  we need, just whatever we can.
 *
 *  @param {NS} ns
 *  @param {Server} server
 *  @return {boolean} Whether the softening was sufficient.
 **/
function soften(ns: NS, server: Server): boolean {
	const hostname = server.hostname
	const required = server.numOpenPortsRequired || 0
	let opened = 0
	if (server.sshPortOpen) {
		opened++
	} else if (ns.fileExists("BruteSSH.exe", "home")) {
		ns.brutessh(hostname)
		opened++
	}
	if (server.ftpPortOpen) {
		opened++
	} else if (ns.fileExists("FTPCrack.exe", "home")) {
		ns.ftpcrack(hostname)
		opened++
	}
	if (server.smtpPortOpen) {
		opened++
	} else if (ns.fileExists("relaySMTP.exe", "home")) {
		ns.relaysmtp(hostname)
		opened++
	}
	if (server.httpPortOpen) {
		opened++
	} else if (ns.fileExists("HTTPWorm.exe", "home")) {
		ns.httpworm(hostname)
		opened++
	}
	if (server.sqlPortOpen) {
		opened++
	} else if (ns.fileExists("SQLInject.exe", "home")) {
		ns.sqlinject(hostname)
		opened++
	}
	return opened >= required
}
