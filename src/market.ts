import { NS } from "@ns"

export async function main(ns: NS) {
	const s = ns.stock

	if (!s.purchaseWseAccount() || !s.purchaseTixApi()) {
		return
	}

	while (true) {
		const symbols = s.getSymbols()

		for (const sym of symbols) {
			const price = s.getPrice(sym)
		}

		await s.nextUpdate()
	}
}