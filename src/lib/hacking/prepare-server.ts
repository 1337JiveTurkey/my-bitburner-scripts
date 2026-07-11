import {NS} from "@ns"
import Log from "lib/logging"
import dodgedMain from "lib/dodge-script"
import {PrepareServerParams, PrepareServerResults} from "/lib/hacking/interface";
import {CompoundTask, GrowTask, RESULT_GRACE, WeakenTask, WorkerPool} from "/lib/worker";


export const main: (ns: NS) => Promise<void> = dodgedMain<PrepareServerParams, PrepareServerResults>(async (ns: NS, p: PrepareServerParams, log: Log): Promise<PrepareServerResults> => {
	const hostname = p.hostname
	const pool = new WorkerPool(ns)
	const result = await prepServer(ns, hostname, pool, log)
	return {
		result
	}
})

async function prepServer(ns: NS, target: string, pool: WorkerPool, log: Log): Promise<string> {
	// Measured rather than hard-coded so BitNode multipliers apply
	const secPerGrow = ns.growthAnalyzeSecurity(1)
	const secPerWeak = ns.weakenAnalyze(1)
	// Largest grow:weaken ratio where one weaken thread still covers the grows
	const growsPerWeaken = Math.max(Math.floor(secPerWeak / secPerGrow), 1)
	do {
		const server = ns.getServer(target)
		if (!server.moneyMax) {
			return "Server has no money so can't be prepped"
		}
		if (server.hackDifficulty === undefined || server.minDifficulty === undefined) {
			return "Server has no hack difficulty so can't be prepped"
		}
		// A fully drained server still grows (grow adds a flat $1/thread
		// before multiplying), so clamp to $1 instead of refusing to prep.
		const moneyAvailable = Math.max(server.moneyAvailable ?? 0, 1)
		const growThreads = Math.ceil(ns.growthAnalyze(target, server.moneyMax / moneyAvailable))

		const excessDifficulty = server.hackDifficulty - server.minDifficulty
		const growthDifficulty = secPerGrow * growThreads

		const excessWeakThreads = Math.ceil(excessDifficulty / secPerWeak)
		const growthWeakThreads = Math.ceil(growthDifficulty / secPerWeak)

		const growTime = ns.getGrowTime(target)
		const weakTime = ns.getWeakenTime(target)
		log.info("Grow Time: %s Weak Time: %s",
			ns.format.time(growTime, false),
			ns.format.time(weakTime, false))

		log.fine("%s growth: %d weaken: %d", target, growThreads, excessWeakThreads + growthWeakThreads)

		let results: PromiseSettledResult<any>[] | null
		if (excessWeakThreads) {
			const weakenTask = new WeakenTask(ns, target, 1, 0)
			results = await pool.executeScalingTask(weakenTask, excessWeakThreads,
				Date.now() + weakTime + RESULT_GRACE)
			log.info("Weaken pass launched %d/%d threads and removed %s of %s excess",
				weakenTask.threadsLaunched, excessWeakThreads,
				ns.format.number(weakenTask.reduced), ns.format.number(excessDifficulty))
		} else if (growThreads) {
			const growUnits = Math.ceil(growThreads / growsPerWeaken)
			const endTime = Date.now() + weakTime
			results = await pool.executeScalingTask(new CompoundTask(new GrowTask(ns, target, growsPerWeaken, endTime),
				new WeakenTask(ns, target, 1, endTime)), growUnits,
				endTime + RESULT_GRACE)
		} else {
			break
		}
		if (results === null) {
			// The loop re-reads the server, so a lost script only costs a retry
			log.warn("Prep pass on %s never fully reported, retrying", target)
		} else if (results.length <= 1) {
			// The only settled promise is the pool's built-in sleep, so nothing ran
			log.warn("No worker RAM free to prep %s, waiting", target)
		}
	} while (true)
	return "Finished prepping " + target
}
