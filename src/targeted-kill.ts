import { NS } from "@ns"
import { getServerState } from "srv/server-state"

export async function main(ns: NS) {
	const flags = ns.flags([
		["all", false],
		["home", false],
		["pserv", false],
		["hacknet", false],
		["hacked", false]
	])
	for (const server of getServerState(ns)) {
		if (flags["all"] ||
		    (flags["home"] && server.isHome) ||
		    (flags["pserv"] && server.isPserv) ||
		    (flags["hacknet"] && server.isHacknet) ||
		    (flags["hacked"] && server.isHacked)
		) {
			ns.killall(server.hostname)
		}

	}
}