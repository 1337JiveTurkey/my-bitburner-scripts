import { NS } from "@ns"
import Table from "lib/tables"

const WINDOW_SIZE = 10 // Number of prices to average

export async function main(ns: NS) {
	const s = ns.stock

	if (!s.purchaseWseAccount() || !s.purchaseTixApi()) {
		return
	}

	const priceHistory: Map<string, number[]> = new Map()

	while (true) {
		const symbols = s.getSymbols()

		for (const sym of symbols) {
			const price = s.getPrice(sym)

			if (!priceHistory.has(sym)) {
				priceHistory.set(sym, [])
			}

			const history = priceHistory.get(sym)!
			history.push(price)
			if (history.length > WINDOW_SIZE) {
				history.shift()
			}
		}

		displayAverages(ns, priceHistory)
		await s.nextUpdate()
	}
}

function displayAverages(ns: NS, priceHistory: Map<string, number[]>) {
	const table = new Table({defaultWidth: 15})
	table.addColumn({headerText: "Symbol"})
	table.addColumn({headerText: "Current Price", fieldType: "number"})
	table.addColumn({headerText: `${WINDOW_SIZE}-Price Avg`, fieldType: "number"})
	table.addColumn({headerText: "Difference", fieldType: "number"})

	const symbols = Array.from(priceHistory.keys()).sort()
	for (const sym of symbols) {
		const history = priceHistory.get(sym)!
		if (history.length === 0) continue

		const currentPrice = history[history.length - 1]
		const average = history.reduce((a, b) => a + b, 0) / history.length
		const difference = currentPrice - average

		table.addRow([sym, currentPrice, average, difference])
	}
	ns.clearLog()
	table.printToTail(ns)
}