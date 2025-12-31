import { NS, Server } from "@ns"
import Table from "lib/tables"
import { registerServicePort } from "lib/services"

const SERVERS_FILE = "/state/servers.json"

/**
 * Program for getting the current states of the servers and writing it to the
 * SERVERS_FILE for other programs to read.
 */
export async function main(ns: NS) {
	ns.disableLog("ALL")
	const flags = ns.flags([
		["server", false],
		["nohack", false]
	])

	const port = registerServicePort(ns)

	do {
		const hostnames = recursiveScan(ns)
		const servers = hostnames.map(hostname => ns.getServer(hostname))
		const jsonServers: ServerState[] = []
		for (const server of servers) {
			let hasAdminRights = server.hasAdminRights
			if (!hasAdminRights && !flags["nohack"]) {
				if (soften(ns, server)) {
					ns.nuke(server.hostname)
					hasAdminRights = true
				}
			}
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
			const jsonServer: ServerState = {
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
			jsonServers.push(jsonServer)
		}

		ns.write(SERVERS_FILE, JSON.stringify(jsonServers, null, 2) , "w")
		if (!flags["server"]) {
			break;
		}
		const portWritten = await Promise.race([
			ns.asleep(60 * 1000).then(_ => false),
			ns.nextPortWrite(port).then(_ => true)])
		if (portWritten) {
			const data = ns.readPort(port)
			ns.tprintf("Got data %s", data)
		}
	} while (true)
}

function recursiveScan(ns: NS): string[] {
	const hostnames = new Set<string>()
	recurse(ns, ns.getHostname(), hostnames)
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
		ns.print("Brute forcing SSH on " + hostname)
		ns.brutessh(hostname)
		opened++
	}
	if (server.ftpPortOpen) {
		opened++
	} else if (ns.fileExists("FTPCrack.exe", "home")) {
		ns.print("Cracking FTP on " + hostname)
		ns.ftpcrack(hostname)
		opened++
	}
	if (server.smtpPortOpen) {
		opened++
	} else if (ns.fileExists("relaySMTP.exe", "home")) {
		ns.print("Relaying SMTP on " + hostname)
		ns.relaysmtp(hostname)
		opened++
	}
	if (server.httpPortOpen) {
		opened++
	} else if (ns.fileExists("HTTPWorm.exe", "home")) {
		ns.print("Worming HTTP on " + hostname)
		ns.httpworm(hostname)
		opened++
	}
	if (server.sqlPortOpen) {
		opened++
	} else if (ns.fileExists("SQLInject.exe", "home")) {
		ns.print("Injecting SQL on " + hostname)
		ns.sqlinject(hostname)
		opened++
	}
	return opened >= required
}


export function getServerState(ns: NS): ServerState[] {
	const state = ns.read(SERVERS_FILE)
	if (state === "") {
		return []
	} else {
		return JSON.parse(state)
	}
}

export function getServerStateMap(ns: NS): Map<string, ServerState> {
	const retVal: Map<string, ServerState> = new Map()
	const servers = getServerState(ns)
	for (const server of servers) {
		retVal.set(server.hostname, server)
	}
	return retVal
}

export interface ServerState {
	hostname: string
	parent?: string
	children: string[]
	hasAdminRights: boolean
	hasBackdoor: boolean
	maxRam: number
	minDifficulty: number
	moneyMax: number
	purchasedByPlayer: boolean
	isHome: boolean
	isPserv: boolean
	isHacknet: boolean
	isHacked: boolean
	requiredHackingSkill: number
}