import { NS } from "@ns"

import { getServerStateMap, ServerState } from "srv/server-state"

const targets = new Set(["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z"])

export async function main(ns: NS) {
	const hacking = ns.getPlayer().skills.hacking

	const servers = getServerStateMap(ns)
	for (const [hostname, server] of servers) {
		const isTarget  = targets.has(hostname)
		const canHack   = server.requiredHackingSkill <= hacking
		const portsOpen = server.hasAdminRights
		if (isTarget && canHack && portsOpen) {
			const path: string[] = [hostname]
			let parent = server.parent
			// Will always be a string so long as we don't have "home" as a target
			while (parent && parent !== "home") {
				path.unshift(parent)
				const parentServer = servers.get(parent) as ServerState
				parent = parentServer.parent
			}
			for (const step of path) {
				ns.singularity.connect(step)
			}
			await ns.singularity.installBackdoor()
			ns.singularity.connect("home")
		}
	}
}