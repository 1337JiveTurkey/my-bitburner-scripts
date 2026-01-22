import {AutocompleteData, NS} from "@ns"
import Log from "lib/logging"
import BatchCalculator from "lib/batch-calculator"
import BatchExecutor from "lib/batch-executor"
import {batchCompare, BatchStats, batchTable} from "lib/batch-stats"
import {HackingInterface} from "/lib/hacking/interface";

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const flags = ns.flags([
		["list", false]
	])
	const hostname = flags["_"].toString()
	const log = new Log(ns).toTerminal().level("INFO")
	const hacking = new HackingInterface(ns, log)

	while (true) {
		const calculator = new BatchCalculator(ns, hostname, log)
		calculator.padding = .1
		const executor = new BatchExecutor(ns, log)

		if (calculator.needsPrep()) {
			log.warn("Server needs prep. Money: %s, Security: %s",
				ns.formatPercent(calculator.moneyPrep()),
				ns.formatPercent(calculator.securityPrep()),
			)
			const {result} = await hacking.prepareServer({hostname})
			log.info("%s", result)
		}

		const possibleBatches: BatchStats[] = calculator.calculateEstimates()

		possibleBatches.sort(batchCompare)
		if (flags["list"]) {
			const estimatesTable = batchTable(possibleBatches)
			estimatesTable.printToTerminal(ns)
		}

		// Get best batch if any for the worker pool
		const bestBatch = executor.bestBatch(possibleBatches)
		if (bestBatch) {
			const oldMoney = ns.self().onlineMoneyMade
			await executor.runOnWorkers(bestBatch)
			const newMoney = ns.self().onlineMoneyMade
			log.info("$%s earned", ns.formatNumber(newMoney - oldMoney))
		} else {
			log.warn("%s", "No best batch found")
			break
		}
	}
}

export function autocomplete(data: AutocompleteData) {
	return [...data.servers]
}