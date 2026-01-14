import {NS} from "@ns"
import dodgedMain from "lib/dodge-script"
import {GetServersParams, GetServersResults, ServerStats} from "lib/servers/interface"

export const main = dodgedMain<GetServersParams, GetServersResults>(async (ns: NS, p: GetServersParams) => {
	const hostnames = recursiveScan(ns)
	const servers = hostnames.map(hostname => ns.getServer(hostname))
	const jsonServers: GetServersResults = {}
	for (const server of servers) {
		let hasAdminRights = server.hasAdminRights
		const isHome = server.hostname === "home"
		const isHacknet = server.hostname.startsWith("hacknet")
		const isPserv = server.hostname.startsWith("cluster")
		const scan = ns.scan(server.hostname)
		const parent = isHome? undefined : scan[0]
		// Everything but home has their parent as first element so strip that
		if (!isHome) {
			scan.shift()
		}
		const children = scan
		const jsonServer: ServerStats = {
			hostname: server.hostname,
			parent,
			children,
			hasAdminRights,
			hasBackdoor: server.backdoorInstalled || false,
			maxRam: server.maxRam,
			minDifficulty: server.minDifficulty || 0,
			moneyMax: server.moneyMax || 0,
			purchasedByPlayer: server.purchasedByPlayer,
			isHome,
			isPserv,
			isHacknet,
			isHacked: !server.purchasedByPlayer && hasAdminRights,
			requiredHackingSkill: server.requiredHackingSkill || 0
		}
		jsonServers[server.hostname] = jsonServer
	}
	return jsonServers
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