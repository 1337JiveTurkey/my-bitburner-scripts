import {NS, ScriptArg} from "@ns"

import { getServers} from "/lib/servers/interface";

const factionTargets = new Set(["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z"])
const finalTargets = new Set(["w0r1d_d43m0n"])

export async function main(ns: NS) {
	let targets: Set<String>
	if (ns.args.length < 1) {
		targets = factionTargets
	} else {
		targets = new Set(ns.args.map(x => x.toString()))
	}

	const hacking = ns.getPlayer().skills.hacking

	const servers = await getServers(ns, {})
	for (const [hostname, server] of Object.entries(servers)) {
		const isTarget  = targets.has(hostname)
		const canHack   = server.requiredHackingSkill <= hacking
		const portsOpen = server.hasAdminRights
		if (isTarget && canHack && portsOpen) {
			const path: string[] = [hostname]
			let parent = server.parent
			// Will always be a string so long as we don't have "home" as a target
			while (parent && parent !== "home") {
				path.unshift(parent)
				const parentServer = servers[parent]
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

export function autocomplete(data: {
	servers: string[],
	scripts: string[]
	txts: string[],
	flags: (schema: [string, string | number | boolean | string[]][]) => { [key: string]: ScriptArg | string[] }
}, args: string[]) {
	return [...data.servers]
}