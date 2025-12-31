import { NS, Server } from "@ns"

export async function main(ns: NS) {
	const flags = ns.flags([
		["purchased", false],
		["hacked", false]
	])
	if (flags["purchased"]) {
		const cluster = new PurchasedCluster(ns)
	}
	if (flags["hacked"]) {
		const cluster = new HackedCluster(ns)
	}
}

const MAX_RAM = 1024*1024

export class ComputeCluster {
	#ns: NS
	#servers: ComputeServer[] = []
	constructor(ns: NS) {
		this.#ns = ns
	}

	get ns() {
		return this.#ns
	}

	get servers() {
		return this.#servers
	}

	addServer(serverName: string) {
		const newServer = new ComputeServer(this.#ns, serverName)
		this.#servers.push(newServer)
		return newServer
	}

	get freeRam() {
		let total = 0
		for (const server of this.#servers) {
			total += server.freeRam
		}
		return total
	}

	get hacksPossible() {
		let total = 0
		for (const server of this.#servers) {
			total += server.hacksPossible
		}
		return total
	}

	get growsPossible() {
		let total = 0
		for (const server of this.#servers) {
			total += server.growsPossible
		}
		return total
	}

	get weaksPossible() {
		let total = 0
		for (const server of this.#servers) {
			total += server.weaksPossible
		}
		return total
	}


	killAll() {
		for (const server of this.#servers) {
			server.killAll()
		}
	}

	clearCachedData() {
		for (const server of this.#servers) {
			server.clearCachedData()
		}
	}

	async clusterHack(target: string, threads: number, delay: number) {
		let threadsLeft = threads
		const promises = []
		for (const server of this.#servers) {
			if (threadsLeft == 0) {
				break
			}
			const serverThreads = Math.min(server.hacksPossible, threadsLeft)
			if (serverThreads) {
				threadsLeft -= serverThreads
				promises.push(server.doHack(target, serverThreads, delay))
			}
		}
		const results = await Promise.all(promises)
		this.clearCachedData()
		return results
	}

	async clusterGrow(target: string, threads: number, delay: number) {
		let threadsLeft = threads
		const promises = []
		for (const server of this.#servers) {
			if (threadsLeft == 0) {
				break
			}
			const serverThreads = Math.min(server.growsPossible, threadsLeft)
			if (serverThreads) {
				threadsLeft -= serverThreads
				promises.push(server.doGrow(target, serverThreads, delay))
			}
		}
		const results = await Promise.all(promises)
		this.clearCachedData()
		return results
	}

	async clusterWeak(target: string, threads: number, delay: number) {
		let threadsLeft = threads
		const promises = []
		for (const server of this.#servers) {
			if (threadsLeft == 0) {
				break
			}
			const serverThreads = Math.min(server.weaksPossible, threadsLeft)
			if (serverThreads) {
				threadsLeft -= serverThreads
				promises.push(server.doWeak(target, serverThreads, delay))
			}

		}
		const results = await Promise.all(promises)
		this.clearCachedData()
		return results
	}
}

/**
 * Class to control the hacking of ComputeServers.
 */
export class HackedCluster extends ComputeCluster {
	#clusterNames: string[] = []
	constructor(ns: NS) {
		super(ns)
		const allNames = this.#recursiveScan(ns.getHostname())
		const allServers = allNames.map(n => ns.getServer(n))
		const otherServers = allServers.filter(server => !server.purchasedByPlayer && server.hostname != "home")
		otherServers.sort((s1, s2) => s1.requiredHackingSkill! - s2.requiredHackingSkill!)

		this.#clusterNames = otherServers.map(server => server.hostname)

		for (const name of this.#clusterNames) {
			const server = ns.getServer(name)
			if (server.hasAdminRights) {
				this.addServer(name)
			}
		}
	}

	#recursiveScan(hostname: string) {
		const hostnames = new Set<string>()
		this.#recurse(hostname, hostnames)
		return [...hostnames]
	}

	#recurse(hostname: string, hostnames: Set<string>) {
		if (!hostnames.has(hostname)) {
			hostnames.add(hostname)
			for (const child of this.ns.scan(hostname)) {
				this.#recurse(child, hostnames)
			}
		}
	}
	
	updateServers() {
		for (const name of this.#clusterNames) {
			const server = this.ns.getServer(name)
			if (!server.hasAdminRights && this.#openServer(server)) {
				this.addServer(name)
			}
		}
	}

	/**
	 *  Attempt to open the server via nuke and the various port openers.
	 **/
	#openServer(server: Server) {
		const hostname = server.hostname
		const portsOpened = this.#soften(server)
		if (portsOpened < server.numOpenPortsRequired!) {
			// this.ns.print("Couldn't soften " + hostname + " enough.")
		} else {
			this.ns.nuke(hostname)
			this.ns.print("Server " + hostname + " gained admin rights")
			return true
		}
		return false
	}

	/**
	 *  Pound the server's ports into submission. Doesn't matter how many ports
	 *  we need, just whatever we can.
	 * 
	 *  @param {Server} server
	 **/
	#soften(server: Server) {
		const hostname = server.hostname
		let retVal = 0
		if (server.sshPortOpen) {
			retVal++
		} else if (this.ns.fileExists("BruteSSH.exe", "home")) {
			// this.ns.print("Brute forcing SSH on " + hostname)
			this.ns.brutessh(hostname);
			retVal++
		}
		if (server.ftpPortOpen) {
			retVal++
		} else if (this.ns.fileExists("FTPCrack.exe", "home")) {
			// this.ns.print("Cracking FTP on " + hostname)
			this.ns.ftpcrack(hostname);
			retVal++
		}
		if (server.smtpPortOpen) {
			retVal++
		} else if (this.ns.fileExists("relaySMTP.exe", "home")) {
			// this.ns.print("Relaying SMTP on " + hostname)
			this.ns.relaysmtp(hostname);
			retVal++
		}
		if (server.httpPortOpen) {
			retVal++
		} else if (this.ns.fileExists("HTTPWorm.exe", "home")) {
			// this.ns.print("Worming HTTP on " + hostname)
			this.ns.httpworm(hostname);
			retVal++
		}
		if (server.sqlPortOpen) {
			retVal++
		} else if (this.ns.fileExists("SQLInject.exe", "home")) {
			// this.ns.print("Injecting SQL on " + hostname)
			this.ns.sqlinject(hostname);
			retVal++
		}
		return retVal
	}
}

/**
 * Class to control the purchasing of ComputeServers.
 */
export class PurchasedCluster extends ComputeCluster {
	#clusterNames: string[] = []
	constructor(ns: NS) {
		super(ns)

		const prefix = "cluster-"
		for (let i = 0; i < ns.getPurchasedServerLimit(); i++) {
			const serverName = prefix + i
			this.#clusterNames.push(serverName)
			if (ns.serverExists(serverName)) {
				this.addServer(serverName)
			}
		}
	}

	/** @param {number} budget */
	upgradeServers(budget: number) {
		const toBuy = this.#clusterNames.length - this.servers.length
		if (toBuy > 0) {
			const perServerBudget = budget / toBuy
			let size = 1
			for (let i = 0; i < 20; i++) {
				if (this.ns.getPurchasedServerCost(size * 2) > perServerBudget) {
					break
				}
				size *= 2
			}
			if (size > 1) {
				for (let i = this.servers.length; i < this.#clusterNames.length; i++) {
					const serverName = this.#clusterNames[i];
					const purchasedName = this.ns.purchaseServer(serverName, size)
					this.addServer(purchasedName)
					this.ns.print("Purchased " + serverName + " with " + this.ns.formatRam(size))
				}
			}
		} else {
			// Upgrade existing servers here
			let min = MAX_RAM
			let minServer = null
			for (let i = 0; i < this.servers.length; i++) {
				const server = this.#clusterNames[i]
				const ram = this.ns.getServerMaxRam(server)
				if (ram < min) {
					minServer = server
					min = ram
				}
			}
			if (min < MAX_RAM && minServer != null) {
				this.clearCachedData()
				const upgradeCost = this.ns.getPurchasedServerUpgradeCost(minServer, min * 2)
				let upgradeAmount = Math.floor(budget / upgradeCost)
				for (let i = 0; i < this.servers.length; i++) {
					const server = this.#clusterNames[i]
					const ram = this.ns.getServerMaxRam(server)
					if (ram == min && upgradeAmount > 0) {
						this.ns.upgradePurchasedServer(server, 2 * min)
						this.ns.print("Upgraded " + server + " to " + this.ns.formatRam(2 * min))
						upgradeAmount--
					}
				}
			}
		}
	}
}

export class ComputeServer {
	#ns: NS
	#serverName: string
	#cachedData: {
		freeRam: number,
		hacksPossible: number,
		growsPossible: number,
		weaksPossible: number,
	} | null = null
	/** @param {NS} ns */
	constructor(ns: NS, serverName: string) {
		this.#ns = ns
		this.#serverName = serverName
		// Just paranoid about stomping my own scripts
		if (serverName != "home") {
			ns.scp(["doHack.js", "doGrow.js", "doWeak.js"], serverName, "home")
		}
	}

	get stats() {
		return this.#ns.getServer(this.#serverName)
	}

	clearCachedData() {
		this.#cachedData = null
	}

	#getCachedData(name: "freeRam" | "hacksPossible" | "growsPossible" | "weaksPossible") {
		if (!this.#cachedData) {
			const stats = this.stats
			const freeRam = stats.maxRam - stats.ramUsed
			const data = {
				freeRam: freeRam,
				hacksPossible: Math.floor(freeRam / this.#ns.getScriptRam("doHack.js")),
				growsPossible: Math.floor(freeRam / this.#ns.getScriptRam("doGrow.js")),
				weaksPossible: Math.floor(freeRam / this.#ns.getScriptRam("doWeak.js")),
			}
			this.#cachedData = data
		}
		return this.#cachedData[name]
	}

	get serverName() {
		return this.#serverName
	}

	get freeRam() {
		return this.#getCachedData("freeRam")
	}

	get hacksPossible() {
		return this.#getCachedData("hacksPossible")
	}

	get growsPossible() {
		return this.#getCachedData("growsPossible")
	}

	get weaksPossible() {
		return this.#getCachedData("weaksPossible")
	}


	killAll() {
		this.#ns.killall(this.#serverName)
	}

	async doHack(target: string, threads: number, delay: number) {
		this.clearCachedData()
		return await this.#exec({
			delay: delay,
			script: "doHack.js",
			server: this.#serverName,
			target: target,
			threads: threads
		})
	}

	async doGrow(target: string, threads: number, delay: number) {
		this.clearCachedData()
		return await this.#exec({
			delay: delay,
			script: "doGrow.js",
			server: this.#serverName,
			target: target,
			threads: threads
		})
	}

	async doWeak(target: string, threads: number, delay: number) {
		this.clearCachedData()
		return await this.#exec({
			delay: delay,
			script: "doWeak.js",
			server: this.#serverName,
			target: target,
			threads: threads
		})
	}

	async #exec(params: ExecParams) {
		const replyPort = this.#ns.exec(params.script, params.server, {threads: params.threads, temporary: true}, JSON.stringify(params))
		if (replyPort) {
			await this.#ns.nextPortWrite(replyPort)
			return this.#ns.readPort(replyPort)
		} else {
			return "Failed"
		}
	}
}

interface ExecParams {
	delay: number
	script: string
	server: string
	target: string
	threads: number
}
