import {NS, Server} from "@ns"
import dodgedMain from "lib/dodge-script"
import {BuyServersParams, BuyServersResults} from "lib/servers/interface"

export const main = dodgedMain<BuyServersParams, BuyServersResults>(async (ns: NS, p: BuyServersParams) => {
	let remainingBudget = p.budget > 0? p.budget : ns.getPlayer().money
	const existingServers = ns.getPurchasedServers()


	return {
		purchasedServers: ns.getPurchasedServers(),
		canBuyMore: true
	} as BuyServersResults
})