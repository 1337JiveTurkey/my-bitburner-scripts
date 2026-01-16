import {AutocompleteData, NS} from "@ns"
import Log from "lib/logging"
import BatchCalculator from "lib/batch-calculator"
import BatchExecutor from "lib/batch-executor"
import {batchCompare, BatchStats, batchTable} from "lib/batch-stats"

export async function main(ns: NS) {
	const flags = ns.flags([
		["list", false]
	])
	const hostname = flags["_"].toString()
	ns.disableLog("ALL")
	const log = new Log(ns).toTerminal().level("INFO")

	const calculator = new BatchCalculator(ns, hostname, log)
	calculator.padding = .1
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

export function autocomplete(data: AutocompleteData, args: string[]) {
	return [...data.servers]
}