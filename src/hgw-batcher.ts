import { NS } from "@ns"
import { ComputeServer } from "/cluster";
import Log from "lib/logging"
import Table from "lib/tables"

export async function main(ns: NS) {
	const hgwBatcher = new HGWBatcher(ns, ns.args[0].toString(), new Log(ns))
	hgwBatcher.printInfo()
	hgwBatcher.calculateEstimates()
	hgwBatcher.printEstimatesInfo()
}

const SEC_PER_HACK = 0.002
const SEC_PER_GROW = 0.004
const SEC_PER_WEAK = 0.05

const MAX_SCRIPTS = 200000

/**
 * Class encapsulating most of the calculations involved with HGW batching a single server.
 * 
 */
export default class HGWBatcher {
	readonly #ns: NS

	#log: Log

	#useFormulas: boolean

	#target = ""
	#hackRam = 0
	#growRam = 0
	#weakRam = 0

	#hackThreads = 0
	#growThreads = 0
	#weakThreads = 0

	#hackTime = 0
	#growTime = 0
	#weakTime = 0

	#hackDelay = 0
	#growDelay = 0

	#batchRam = 0

	#servers: any[] = []

	#percent = .01

	#threadEstimates: ThreadEstimate[] = []

	set percent(newPercent: number) {
		this.#percent = newPercent
		if (this.#useFormulas) {
			this.#calculateThreadsFormula()
		} else {
			this.#calculateThreads()
		}
	}

	get percent() {
		return this.#percent
	}

	// Java bullshit for now
	get threadEstimates(): ThreadEstimate[] {
		return this.#threadEstimates
	}

	printInfo() {
		const infoTable = new Table()
		infoTable.addColumn({ headerText: this.#target })
		infoTable.addColumn({ headerText: "RAM", fieldType: "ram" })
		infoTable.addColumn({ headerText: "Threads", fieldType: "number" })
		infoTable.addColumn({ headerText: "Time", fieldType: "msectime" })
		infoTable.addRow(["Hack",   this.#hackRam, this.#hackThreads, this.#hackTime])
		infoTable.addRow(["Grow",   this.#growRam, this.#growThreads, this.#growTime])
		infoTable.addRow(["Weaken", this.#weakRam, this.#weakThreads, this.#weakTime])
		infoTable.printToTerminal(this.#ns)
	}

	printServersInfo() {
		const serversTable = new Table()
		serversTable.addColumn({ headerText: "Hostname" })
		serversTable.addColumn({ headerText: "Free RAM", fieldType: "ram", fieldWidth: 15 })
		serversTable.addColumn({ headerText: "Batches", fieldWidth: 10 })
		let totalFreeRam = 0
		let totalBatches = 0
		for (const server of this.#servers) {
			const serverBatches = Math.floor(server.freeRam / this.#batchRam)
			if (serverBatches > 0) {
				totalFreeRam += server.freeRam
				totalBatches += serverBatches
				serversTable.addRow([server.serverName, server.freeRam, serverBatches])
			}
		}
		serversTable.addRow(["Total", totalFreeRam, totalBatches])
		serversTable.printToTail(this.#ns)
	}

	printEstimatesInfo() {
		const estimatesTable = new Table({ defaultWidth: 15 })
		estimatesTable.addColumn({ headerText: "Hack Threads", fieldName: "hackThreads" })
		estimatesTable.addColumn({ headerText: "Grow Threads", fieldName: "growThreads" })
		estimatesTable.addColumn({ headerText: "Weak Threads", fieldName: "weakThreads" })
		estimatesTable.addColumn({ headerText: "Batch RAM", fieldName: "batchRam", fieldType: "ram" })
		estimatesTable.addColumn({ headerText: "Batch Money", fieldName: "hackMoney", fieldType: "number" })
		estimatesTable.addColumn({ headerText: "Percentage", fieldName: "hackPercent", fieldType: "percent" })
		estimatesTable.addColumn({ headerText: "Efficiency", fieldName: "hackEfficiency", fieldType: "number" })

		for (const estimate of this.#threadEstimates) {
			estimatesTable.addRow(estimate)
		}

		estimatesTable.printToTail(this.#ns)
		this.#ns.ui.openTail()
	}

	constructor(ns: NS, target: string, log: Log|null=null, useFormulas:boolean|null=null) {
		this.#ns = ns
		if (log) {
			this.#log = log
		} else {
			this.#log = new Log(ns)
		}

		if (useFormulas === null) {
			this.#useFormulas = ns.fileExists("Formulas.exe")
		} else {
			this.#useFormulas = useFormulas
		}

		this.#hackRam = ns.getScriptRam("doHack.js")
		this.#growRam = ns.getScriptRam("doGrow.js")
		this.#weakRam = ns.getScriptRam("doWeak.js")
		this.#target = target

		if (this.#useFormulas) {
			this.#calculateTimesFormula()
			this.#calculateThreadsFormula()
		} else {
			this.#calculateTimes()
			this.#calculateThreads()
		}
	}

	/**
	 * Tells how prepped the server is from -1 for can't be prepped
	 * to 1 for fully prepped.
	 */
	percentPrepped(): number {
		const target = this.#ns.getServer(this.#target)
		if (!target.hackDifficulty || !target.minDifficulty) {
			this.#log.error("Target %s has no hackDifficulty or minDifficulty", this.#target)
			return -1
		}
		if (!target.moneyMax || !target.moneyAvailable) {
			this.#log.error("Target %s has no moneyAvailable or moneyMax", this.#target)
			return -1
		}
		const excessDifficulty = target.hackDifficulty - target.minDifficulty
		const moneyDeficit = target.moneyMax - target.moneyAvailable
		return 0
	}

	/**
	 * Calculate times needed to hack, grow and weaken.
	 */
	#calculateTimes() {
		this.#hackTime = this.#ns.getHackTime(this.#target)
		this.#growTime = this.#ns.getGrowTime(this.#target)
		this.#weakTime = this.#ns.getWeakenTime(this.#target)

		this.#hackDelay = this.#weakTime - this.#hackTime
		this.#growDelay = this.#weakTime - this.#growTime
	}

	#calculateThreads() {
		const moneyAvailable = this.#ns.getServerMoneyAvailable(this.#target)
		const moneyMax = this.#ns.getServerMaxMoney(this.#target)
		const money = moneyAvailable * this.#percent

		this.#hackThreads = Math.floor(this.#ns.hackAnalyzeThreads(this.#target, money))
		this.#growThreads = Math.ceil(this.#ns.growthAnalyze(this.#target, moneyMax / (moneyMax - money)))
		this.#weakThreads = Math.ceil((SEC_PER_HACK * this.#hackThreads + SEC_PER_GROW * this.#growThreads) / SEC_PER_WEAK)

		this.#batchRam = (
			this.#hackThreads * this.#hackRam +
			this.#growThreads * this.#growRam +
			this.#weakThreads * this.#weakRam)
	}

	#calculateEstimates() {
		const moneyAvailable = this.#ns.getServerMoneyAvailable(this.#target)
		const moneyMax = this.#ns.getServerMaxMoney(this.#target)
		const perThreadMoney = this.#ns.hackAnalyze(this.#target) * moneyMax

		for (let i = 1; i <= 100; i++) {
			const hackThreads = i
			const hackMoney = i * perThreadMoney
			if (hackMoney >= moneyAvailable) {
				break
			}
			const growThreads = Math.ceil(this.#ns.growthAnalyze(this.#target, moneyMax / (moneyMax - hackMoney)))
			const weakThreads = Math.ceil((SEC_PER_HACK * hackThreads + SEC_PER_GROW * growThreads) / SEC_PER_HACK)
			const batchRam = hackThreads * this.#hackRam + growThreads * this.#growRam + weakThreads * this.#weakRam

			this.#threadEstimates.push({
				hackThreads: hackThreads,
				growThreads: growThreads,
				weakThreads: weakThreads,
				batchRam: batchRam,
				hackMoney: hackMoney,
				hackPercent: hackMoney / moneyMax,
				hackEfficiency: hackMoney / batchRam / this.#weakTime * 1000
			})
		}
	}

	/**
	 * Calculate times needed to hack, grow and weaken with Formulas.exe
	 */
	#calculateTimesFormula() {
		const h = this.#ns.formulas.hacking
		const s = this.#ns.getServer(this.#target)
		const p = this.#ns.getPlayer()

		// s.hackDifficulty = s.minDifficulty
		// s.moneyAvailable = s.moneyMax

		this.#hackTime = h.hackTime(s, p)
		this.#growTime = h.growTime(s, p)
		this.#weakTime = h.weakenTime(s, p)

		this.#hackDelay = this.#weakTime - this.#hackTime
		this.#growDelay = this.#weakTime - this.#growTime
	}

	#calculateThreadsFormula() {
		const h = this.#ns.formulas.hacking
		const s = this.#ns.getServer(this.#target)
		const p = this.#ns.getPlayer()

		// TODO This is not robust in the slightest
		if (typeof s.moneyAvailable === "undefined" || 
				typeof s.moneyMax === "undefined" ||
				typeof s.hackDifficulty === "undefined" ||
				typeof s.minDifficulty === "undefined") {
			this.#log.error("Target %s isn't a valid target due to missing fields.", this.#target)
			return
		}

		s.hackDifficulty = s.minDifficulty
		s.moneyAvailable = s.moneyMax

		const money = s.moneyMax * this.#percent

		this.#hackThreads = Math.floor(this.#percent / h.hackPercent(s, p))
		s.moneyAvailable -= money
		s.hackDifficulty += SEC_PER_HACK * this.#hackThreads
		this.#growThreads = Math.ceil(h.growThreads(s, p, s.moneyMax))
		s.hackDifficulty += SEC_PER_GROW * this.#growThreads
		this.#weakThreads = Math.ceil((s.hackDifficulty - s.minDifficulty) / SEC_PER_WEAK)

		this.#batchRam = (
			this.#hackThreads * this.#hackRam +
			this.#growThreads * this.#growRam +
			this.#weakThreads * this.#weakRam)
	}

	#calculateEstimatesFormula() {
		const h = this.#ns.formulas.hacking
		const s = this.#ns.getServer(this.#target)
		const p = this.#ns.getPlayer()

		if (typeof s.moneyAvailable === "undefined" || 
				typeof s.moneyMax === "undefined" ||
				typeof s.hackDifficulty === "undefined" ||
				typeof s.minDifficulty === "undefined") {
			this.#log.error("Target %s isn't a valid target due to missing fields.", this.#target)
			return
		}

		s.hackDifficulty = s.minDifficulty
		s.moneyAvailable = s.moneyMax

		const perThreadMoney = h.hackPercent(s, p) * s.moneyMax

		for (let i = 1; i <= 100; i++) {
			const hackThreads = i
			const hackMoney = i * perThreadMoney

			s.hackDifficulty = s.minDifficulty
			s.moneyAvailable = s.moneyMax

			if (hackMoney >= s.moneyAvailable) {
				break
			}
			s.moneyAvailable -= hackMoney
			s.hackDifficulty += SEC_PER_HACK * hackThreads
			const growThreads = Math.ceil(h.growThreads(s, p, s.moneyMax))
			s.hackDifficulty += SEC_PER_GROW * growThreads
			const weakThreads = Math.ceil((s.hackDifficulty - s.minDifficulty) / SEC_PER_WEAK)
			const batchRam = hackThreads * this.#hackRam + growThreads * this.#growRam + weakThreads * this.#weakRam

			this.#threadEstimates.push({
				hackThreads: hackThreads,
				growThreads: growThreads,
				weakThreads: weakThreads,
				batchRam: batchRam,
				hackMoney: hackMoney,
				hackPercent: hackMoney / s.moneyMax,
				hackEfficiency: hackMoney / batchRam / this.#weakTime * 1000
			})
		}
	}

	calculateEstimates() {
		this.#threadEstimates = []
		if (this.#useFormulas) {
			this.#calculateEstimatesFormula()
		} else {
			this.#calculateEstimates()
		}
		this.#threadEstimates.sort((a, b) => {
			return b.hackEfficiency - a.hackEfficiency
		})
	}

	/**
	 * Set the servers to be used to run the batcher but don't run the batcher just yet.
	 */
	setServers(servers: ComputeServer[]) {
		this.#servers = servers
		this.#servers.sort((a, b) => {
			return b.freeRam - a.freeRam
		})
	}

	/**
	 * Actually run the batcher itself.
	 */
	async runOnServers() {
		const promises = []
		let batchDelay = 0
		let totalScripts = 0
sl:	for (const server of this.#servers) {
			const serverBatches = Math.floor(server.freeRam / this.#batchRam)
			for (let i = 0; i < serverBatches; i++) {
				promises.push(server.doHack(this.#target, this.#hackThreads, this.#hackDelay + batchDelay))
				promises.push(server.doGrow(this.#target, this.#growThreads, this.#growDelay + batchDelay))
				promises.push(server.doWeak(this.#target, this.#weakThreads,                   batchDelay))
				totalScripts += 3
				if (totalScripts > MAX_SCRIPTS) {
					break sl
				}
				// batchDelay += 1
			}
		}

		await Promise.all(promises)
	}
}

/**
 * This is a record of a possible thread configuration for running the batcher
 * on a specific server.
 */
export interface ThreadEstimate {
	hackThreads: number,
	growThreads: number,
	weakThreads: number,
	batchRam: number,
	hackMoney: number,
	hackPercent: number,
	hackEfficiency: number
}
