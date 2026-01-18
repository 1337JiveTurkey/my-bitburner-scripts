import {NS} from "@ns"
import dodgedMain from "lib/dodge-script"
import {PrepareServerParams, PrepareServerResults} from "/lib/hacking/interface";
import {CompoundTask, GrowTask, WeakenTask, WorkerPool} from "/lib/worker";

const SEC_PER_HACK = 0.002
const SEC_PER_GROW = 0.004
const SEC_PER_WEAK = 0.05

export const main: (ns: NS) => Promise<void> = dodgedMain<PrepareServerParams, PrepareServerResults>(async (ns: NS, p: PrepareServerParams): Promise<PrepareServerResults> => {
	const hostname = p.hostname
	const pool = new WorkerPool(ns)
	const result = await prepServer(ns, hostname, pool)
	return {
		result
	}
})

async function prepServer(ns: NS, target: string, pool: WorkerPool): Promise<string> {
	do {
		const server = ns.getServer(target)
		if (!server.moneyMax || !server.moneyAvailable) {
			return "Server has no money so can't be prepped"
		}
		if (!server.hackDifficulty || !server.minDifficulty) {
			return "Server has no hack difficulty so can't be prepped"
		}
		const ratio = server.moneyMax / server.moneyAvailable
		const growThreads = Number.isFinite(ratio)?
			Math.ceil(ns.growthAnalyze(target, ratio)) :
			Math.floor(server.moneyMax)

		const excessDifficulty = server.hackDifficulty - server.minDifficulty
		const growthDifficulty = SEC_PER_GROW * growThreads

		const excessWeakThreads = Math.ceil(excessDifficulty / SEC_PER_WEAK)
		const growthWeakThreads = Math.ceil(growthDifficulty / SEC_PER_WEAK)

		const growTime = ns.getGrowTime(target)
		const weakTime = ns.getWeakenTime(target)
		ns.tprintf("Grow Time: %s Weak Time: %s",
			ns.tFormat(growTime, false),
			ns.tFormat(weakTime, false))

		const growDelay = weakTime - growTime

		ns.print(target + " growth: " + growThreads + " weaken: " + (excessWeakThreads + growthWeakThreads))

		if (excessWeakThreads) {
			await pool.executeScalingTask(new WeakenTask(target, 1, 0))
		} else if (growThreads) {
			await pool.executeScalingTask(new CompoundTask(new GrowTask(target, 12, growDelay),
				new WeakenTask(target, 1, 0)))
		} else {
			break
		}
	} while (true)
	return "Finished prepping " + target
}
