import {NS, ScriptArg} from "@ns"
import Log from "lib/logging"
import BatchCalculator from "lib/batch-calculator"
import BatchExecutor from "lib/batch-executor"
import {batchCompare, BatchStats, batchTable} from "lib/batch-stats"

export async function main(ns: NS) {
	const flags = ns.flags([
		["list", false]
	])
	ns.disableLog("ALL")
	const log = new Log(ns).toTerminal().level("INFO")

	const calculator = new BatchCalculator(ns, ns.args[0].toString(), log)
	const executor = new BatchExecutor(ns, log)
	
	const possibleBatches: BatchStats[] = calculator.calculateEstimates()

	possibleBatches.sort(batchCompare)
	if (flags["list"]) {
		const estimatesTable = batchTable(possibleBatches)
		estimatesTable.printToTerminal(ns)
	}

	// Get best batch if any for the worker pool
	const bestBatch = executor.bestBatch(possibleBatches)
	if (bestBatch) {
		log.info("Going with %s", ns.formatPercent(bestBatch.hackPercent))

		await executor.runOnWorkers(bestBatch)

		log.info("Gathered $%s", ns.formatNumber(ns.self().onlineMoneyMade))
		if (calculator.needsPrep()) {
			log.warn("Server needs prep after test run")
		}
	} else {
		log.warn("%s", "No best batch found")
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