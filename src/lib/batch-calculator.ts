import {NS} from "@ns"
import Log from "lib/logging"
import { TargetStats, BatchStats } from "lib/batch-stats"

/**
 * Updated class for computing batch statistics. Cleaned up the calculations
 * to be more uniform.
 */
export default class BatchCalculator implements TargetStats {
	#ns: NS

	#log: Log

	readonly #useFormulas: boolean
	/**
	 * Extra fraction of grow threads beyond the computed need. This is the
	 * main defense against mid-wave level-ups making hacks steal more than
	 * they were sized for (see the shotgun batching notes in CLAUDE.md).
	 */
	growPadding: number = 0
	/** Extra fraction of weaken threads beyond the computed need. */
	weakenPadding: number = 0
	/**
	 * Fraction of max money below which the server counts as needing prep.
	 * 1 demands exactly full money; ~0.99 lets a shotgun wave's small
	 * inversion deficits self-heal in the next wave (padded grows cap at
	 * max) instead of paying a full prep cycle for a sub-1% dip.
	 */
	prepTolerance: number = 1

	hostname = ""
	hackRam = 0
	growRam = 0
	weakRam = 0

	secPerHack = 0
	secPerGrow = 0
	secPerWeak = 0

	hackTime = 0
	growTime = 0
	weakTime = 0

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

		// Measure the RAM of the workers this system actually runs (see the
		// *_WORKER constants in lib/worker.ts, which BatchExecutor executes).
		// The old doHack/doGrow/doWeak scripts belong to the cluster/hgw-batcher
		// path and aren't run here, so measuring them gave 0 RAM.
		this.hackRam = ns.getScriptRam("workers/hack.js")
		this.growRam = ns.getScriptRam("workers/grow.js")
		this.weakRam = ns.getScriptRam("workers/weaken.js")
		if (!this.hackRam || !this.growRam || !this.weakRam) {
			throw new Error("Worker scripts are missing so batches can't be sized")
		}

		// Measured rather than hard-coded: BitNode multipliers scale these
		// (ServerWeakenRate in particular), and sizing weakens from the vanilla
		// 0.05 leaves every batch under-weakened in such BitNodes.
		this.secPerHack = ns.hackAnalyzeSecurity(1)
		this.secPerGrow = ns.growthAnalyzeSecurity(1)
		this.secPerWeak = ns.weakenAnalyze(1)

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
	 * Pads a thread count, including the ceiling it needs either way.
	 * @param p The number of threads to begin with.
	 * @param padding Extra fraction of threads (0 = exact need).
	 */
	pad(p: number, padding: number): number {
		if (padding) {
			const padded = Math.ceil(p * (padding + 1))
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
		this.#log.fine("Calculating batch taking %s", this.#ns.format.percent(percent))
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
		const growThreads = this.pad(this.#ns.growthAnalyze(this.hostname, moneyMax / (moneyMax - targetMoney)), this.growPadding)
		const weakThreads = this.pad((this.secPerHack * hackThreads + this.secPerGrow * growThreads) / this.secPerWeak, this.weakenPadding)

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
		s.hackDifficulty! += this.secPerHack * hackThreads
		const growThreads = this.pad(h.growThreads(s, p, moneyMax), this.growPadding)
		s.hackDifficulty! += this.secPerGrow * growThreads
		const weakThreads = this.pad((s.hackDifficulty! - s.minDifficulty!) / this.secPerWeak, this.weakenPadding)

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
			const growThreads = this.pad(this.#ns.growthAnalyze(this.hostname, moneyMax / (moneyMax - hackMoney)), this.growPadding)
			const weakThreads = this.pad((this.secPerHack * hackThreads + this.secPerGrow * growThreads) / this.secPerWeak, this.weakenPadding)
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
			s.hackDifficulty! += this.secPerHack * hackThreads
			const growThreads = this.pad(h.growThreads(s, p, moneyMax), this.growPadding)
			s.hackDifficulty! += this.secPerGrow * growThreads
			const weakThreads = this.pad((s.hackDifficulty! - s.minDifficulty!) / this.secPerWeak, this.weakenPadding)
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
	 * Security must be exactly at minimum; money only has to clear
	 * prepTolerance's share of max.
	 */
	needsPrep(): boolean {
		this.#log.fine("Determining whether prep is necessary")
		const s = this.#ns.getServer(this.hostname)
		if (s.hackDifficulty !== s.minDifficulty) {
			return true
		}
		return (s.moneyAvailable ?? 0) < (s.moneyMax ?? 0) * this.prepTolerance
	}

	moneyPrep(): number {
		const s = this.#ns.getServer(this.hostname)
		if (!s.moneyMax || s.moneyAvailable === undefined) {
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
