import {AutocompleteData, NS} from "@ns"
import Log from "lib/logging"
import BatchCalculator from "lib/batch-calculator"
import BatchExecutor from "lib/batch-executor"
import {batchCompare, BatchStats, batchTable} from "lib/batch-stats"
import {HackingInterface} from "/lib/hacking/interface";

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const flags = ns.flags([
		["list", false],
		["grow-padding", 0.10],
		["weaken-padding", 0.10],
		["prep-tolerance", 0.99],
		["launch-slack", 5000],
		["host-spacing", 0],
	])
	const positional = flags["_"] as string[]
	if (positional.length !== 1 || !ns.serverExists(positional[0])) {
		ns.tprintf("Usage: run %s [--list] [--grow-padding 0.1] [--weaken-padding 0.1] [--prep-tolerance 0.99] "
			+ "[--launch-slack 5000] [--host-spacing 0] <hostname>",
			ns.self().filename)
		return
	}
	const hostname = positional[0]
	const log = new Log(ns).toTerminal().level("INFO")
	const hacking = new HackingInterface(ns, log)

	while (true) {
		const calculator = new BatchCalculator(ns, hostname, log)
		calculator.growPadding = flags["grow-padding"] as number
		calculator.weakenPadding = flags["weaken-padding"] as number
		calculator.prepTolerance = flags["prep-tolerance"] as number
		const executor = new BatchExecutor(ns, log)
		executor.launchSlack = flags["launch-slack"] as number
		executor.hostSpacing = flags["host-spacing"] as number

		if (calculator.needsPrep()) {
			log.warn("Server needs prep. Money: %s, Security: %s",
				ns.format.percent(calculator.moneyPrep()),
				ns.format.percent(calculator.securityPrep()),
			)
			const {result} = await hacking.prepareServer({hostname})
			log.info("%s", result)
			calculator.recalculateTimes()
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
			const earned = await executor.runOnWorkers(bestBatch)
			log.info("$%s earned", ns.format.number(earned))
		} else {
			log.warn("%s", "No best batch found")
			break
		}
	}
}

export function autocomplete(data: AutocompleteData) {
	return [...data.servers]
}