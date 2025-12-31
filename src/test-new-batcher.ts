import { NS } from "@ns"
import Log from "lib/logging"
import BatchCalculator from "lib/batch-calculator"
import BatchExecutor from "lib/batch-executor"
import {batchCompare, BatchStats, batchTable} from "lib/batch-stats"

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const log = new Log(ns).toTerminal().level("FINE")

	const calculator = new BatchCalculator(ns, ns.args[0].toString(), log)
	const executor = new BatchExecutor(ns, log)
	
	const possibleBatches: BatchStats[] = calculator.calculateEstimates()

	possibleBatches.sort(batchCompare)
	const estimatesTable = batchTable(possibleBatches)
	estimatesTable.printToTerminal(ns)
	log.info("Going with %s", ns.formatPercent(possibleBatches[0].hackPercent))

	await executor.runOnWorkers(possibleBatches[0])

	// This script had better exist
	log.info("Gathered $%s", ns.formatNumber(ns.self().onlineMoneyMade))
	if (calculator.needsPrep()) {
		log.warn("Server needs prep after test run")
	}
}