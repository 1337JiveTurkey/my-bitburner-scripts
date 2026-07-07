import {NS, Server} from "@ns"
import dodgedMain from "lib/dodge-script"
import {BuyServersParams, BuyServersResults} from "lib/servers/interface"

export const main: (ns: NS) => Promise<void> = dodgedMain<BuyServersParams, BuyServersResults>(async (ns: NS, p: BuyServersParams) => {
	let remainingBudget = p.budget > 0? p.budget : ns.getPlayer().money
	const existingServers = ns.cloud.getServerNames()


	return {
		purchasedServers: ns.cloud.getServerNames(),
		canBuyMore: true
	} as BuyServersResults
})