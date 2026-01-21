import {NS, Server} from "@ns"
import Log from "lib/logging"
import { TargetStats, BatchStats } from "lib/batch-stats"

const SEC_PER_HACK = 0.002
const SEC_PER_GROW = 0.004
const SEC_PER_WEAK = 0.05

/**
 * Updated class for computing batch statistics. Cleaned up the calculations
 * to be more uniform.
 */
export default class BatchCalculator implements TargetStats {
	#ns: NS

	#log: Log

	readonly #useFormulas: boolean
	padding: number = 0

	hostname = ""
	hackRam = 0
	growRam = 0
	weakRam = 0

	hackTime = 0
	growTime = 0
	weakTime = 0

	hackDelay = 0
	growDelay = 0

	constructor(ns: NS, target: string, log: Log|null=null, useFormulas:boolean|null=null) {
		this.#ns = ns
		if (log) {
			this.#log = log
		} else {
			this.#log = new Log(ns)
		}

		if (useFormulas === null) {
			this.#useFormulas = ns.fileExists("Formulas.exe")
			if (this.#useFormulas)
				this.#log.fine("Using formulas because Formulas.exe exists.")
		} else {
			this.#useFormulas = useFormulas
		}

		this.hackRam = ns.getScriptRam("doHack.js")
		this.growRam = ns.getScriptRam("doGrow.js")
		this.weakRam = ns.getScriptRam("doWeak.js")
		this.hostname = target

		this.recalculateTimes()
	}

	/**
	 * Calculate times needed to hack, grow and weaken.
	 */
	recalculateTimes() {
		this.#log.fine("Recalculating execution times")
		if (this.needsPrep()) {
			this.#log.warn("Server needs prep so times are slower than expected")
		}
		if (this.#useFormulas) {
			this.#recalculateTimesFormula()
		} else {
			this.#recalculateTimes()
		}

		this.hackDelay = this.weakTime - this.hackTime
		this.growDelay = this.weakTime - this.growTime
	}

	#recalculateTimes() {
		this.hackTime = this.#ns.getHackTime(this.hostname)
		this.growTime = this.#ns.getGrowTime(this.hostname)
		this.weakTime = this.#ns.getWeakenTime(this.hostname)
	}

	#recalculateTimesFormula() {
		const h = this.#ns.formulas.hacking
		const s = this.#ns.getServer(this.hostname)
		const p = this.#ns.getPlayer()

		this.hackTime = h.hackTime(s, p)
		this.growTime = h.growTime(s, p)
		this.weakTime = h.weakenTime(s, p)
	}

	/**
	 * Pads grow and weaken threads, including the ceiling that both need.
	 * @param p The number of threads to begin with.
	 */
	pad(p: number): number {
		if (this.padding) {
			const padded = Math.ceil(p * (this.padding + 1))
			const plusOne = Math.ceil(p + 1)
			return Math.max(padded, plusOne)
		}
		else {
			return Math.ceil(p)
		}
	}

	/**
	 * Get the BatchStats for a batch getting a specific percentage of the server's money.
	 * Now computes the actual percentage of the server targeted.
	 */
	forPercentage(percent: number): BatchStats {
		this.#log.fine("Calculating batch taking %s", this.#ns.formatPercent(percent))
		if (this.#useFormulas) {
			return this.#forPercentageFormula(percent)
		} else {
			return this.#forPercentage(percent)
		}
	}

	#forPercentage(percent: number): BatchStats {
		const s = this.#ns.getServer(this.hostname)
		const moneyMax = s.moneyMax!
		const perThreadMoney = this.#ns.hackAnalyze(this.hostname) * moneyMax
		const targetMoney = moneyMax * percent

		const hackThreads = Math.floor(this.#ns.hackAnalyzeThreads(this.hostname, targetMoney))
		const growThreads = this.pad(this.#ns.growthAnalyze(this.hostname, moneyMax / (moneyMax - targetMoney)))
		const weakThreads = this.pad((SEC_PER_HACK * hackThreads + SEC_PER_GROW * growThreads) / SEC_PER_WEAK)

		const batchRam = hackThreads * this.hackRam + growThreads * this.growRam + weakThreads * this.weakRam
		const hackMoney = perThreadMoney * hackThreads

		return {
			target: this,
			hackThreads,
			growThreads,
			weakThreads,
			batchRam,
			hackMoney,
			hackPercent: hackMoney / moneyMax,
			hackEfficiency: hackMoney / batchRam / this.weakTime * 1000
		}
	}

	#forPercentageFormula(percent: number): BatchStats {
		const h = this.#ns.formulas.hacking
		const s = this.#ns.getServer(this.hostname)
		const p = this.#ns.getPlayer()

		s.hackDifficulty = s.minDifficulty
		s.moneyAvailable = s.moneyMax

		const moneyMax = s.moneyMax!

		const hackThreads = Math.floor(percent / h.hackPercent(s, p))
		const perThreadMoney = h.hackPercent(s, p) * moneyMax
		const hackMoney = perThreadMoney * hackThreads
		s.moneyAvailable! -= hackMoney
		s.hackDifficulty! += SEC_PER_HACK * hackThreads
		const growThreads = this.pad(h.growThreads(s, p, moneyMax))
		s.hackDifficulty! += SEC_PER_GROW * growThreads
		const weakThreads = this.pad((s.hackDifficulty! - s.minDifficulty!) / SEC_PER_WEAK)

		const batchRam = hackThreads * this.hackRam + growThreads * this.growRam + weakThreads * this.weakRam

		return {
			target: this,
			hackThreads,
			growThreads,
			weakThreads,
			batchRam,
			hackMoney,
			hackPercent: hackMoney / moneyMax,
			hackEfficiency: hackMoney / batchRam / this.weakTime * 1000
		}
	}

	calculateEstimates(maxRam: number = 0): BatchStats[] {
		this.#log.fine("Calculating estimates")
		if (this.#useFormulas) {
			return this.#calculateEstimatesFormula(maxRam)
		} else {
			return this.#calculateEstimates(maxRam)
		}
	}

	#calculateEstimates(maxRam: number): BatchStats[] {
		const s = this.#ns.getServer(this.hostname)
		const moneyMax = s.moneyMax!
		const perThreadMoney = this.#ns.hackAnalyze(this.hostname) * moneyMax

		const retVal: BatchStats[] = []

		for (let i = 1; i <= 100; i++) {
			const hackThreads = i
			const hackMoney = i * perThreadMoney
			if (hackMoney >= moneyMax) {
				break
			}
			const growThreads = this.pad(this.#ns.growthAnalyze(this.hostname, moneyMax / (moneyMax - hackMoney)))
			const weakThreads = this.pad((SEC_PER_HACK * hackThreads + SEC_PER_GROW * growThreads) / SEC_PER_HACK)
			const batchRam = hackThreads * this.hackRam + growThreads * this.growRam + weakThreads * this.weakRam

			if (batchRam > maxRam && maxRam > 0) {
				break
			}
			retVal.push({
				target: this,
				hackThreads,
				growThreads,
				weakThreads,
				batchRam,
				hackMoney,
				hackPercent: hackMoney / moneyMax,
				hackEfficiency: hackMoney / batchRam / this.weakTime * 1000
			})
		}
		return retVal
	}

	#calculateEstimatesFormula(maxRam: number): BatchStats[] {
		const h = this.#ns.formulas.hacking
		const s = this.#ns.getServer(this.hostname)
		const p = this.#ns.getPlayer()

		const moneyMax = s.moneyMax!

		s.hackDifficulty = s.minDifficulty!
		s.moneyAvailable = moneyMax

		const perThreadMoney = h.hackPercent(s, p) * moneyMax

		const retVal: BatchStats[] = []

		for (let i = 1; i <= 100; i++) {
			const hackThreads = i
			const hackMoney = i * perThreadMoney

			s.hackDifficulty = s.minDifficulty
			s.moneyAvailable = s.moneyMax

			if (hackMoney >= s.moneyAvailable!) {
				break
			}
			s.moneyAvailable! -= hackMoney
			s.hackDifficulty! += SEC_PER_HACK * hackThreads
			const growThreads = this.pad(h.growThreads(s, p, moneyMax))
			s.hackDifficulty! += SEC_PER_GROW * growThreads
			const weakThreads = this.pad((s.hackDifficulty! - s.minDifficulty!) / SEC_PER_WEAK)
			const batchRam = hackThreads * this.hackRam + growThreads * this.growRam + weakThreads * this.weakRam

			if (batchRam > maxRam && maxRam > 0) {
				break
			}
			retVal.push({
				target: this,
				hackThreads: hackThreads,
				growThreads: growThreads,
				weakThreads: weakThreads,
				batchRam: batchRam,
				hackMoney: hackMoney,
				hackPercent: hackMoney / s.moneyMax!,
				hackEfficiency: hackMoney / batchRam / this.weakTime * 1000
			})
		}
		return retVal
	}

	/**
	 * Returns whether this server needs to be prepped in the first place.
	 */
	needsPrep(): boolean {
		this.#log.fine("Determining whether prep is necessary")
		const s = this.#ns.getServer(this.hostname)
		return s.moneyAvailable !== s.moneyMax && s.hackDifficulty !== s.minDifficulty
	}

	moneyPrep(): number {
		const s = this.#ns.getServer(this.hostname)
		if (!s.moneyMax || !s.moneyAvailable) {
			return -1
		}
		const moneyDeficit = s.moneyMax - s.moneyAvailable
		return 1 - moneyDeficit / s.moneyMax
	}

	securityPrep(): number {
		const s = this.#ns.getServer(this.hostname)
		if (!s.hackDifficulty || !s.minDifficulty) {
			return -1
		}
		const excessDifficulty = s.hackDifficulty - s.minDifficulty
		const difficultyRange = 100 - s.minDifficulty
		return 1 - excessDifficulty / difficultyRange
	}
}
