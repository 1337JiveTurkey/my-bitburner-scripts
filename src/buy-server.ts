import {NS} from "@ns"
import Table from "lib/tables";

export async function main(ns: NS) {
	const flags = ns.flags([
		["list", false],
		["budget", -1],
		["wide", false],
		["tall", false]
	])
	if (flags["list"]) {
		listServerCosts(ns)
		return
	}
	const budgetFlag = Number(flags["budget"])
	const budget = budgetFlag >= 0? budgetFlag : ns.getPlayer().money

	let changes = false
	if (flags["wide"]) {
		changes = changes || wideStrategy(ns, budget)
	}
	else if (flags["tall"]) {
		changes = changes || tallStrategy(ns, budget)
	} else {
		ns.tprintf("Expecting either --list, --wide or --tall")
	}
	if (changes) {
		ns.spawn("service.js", { spawnDelay: 100 }, "server-state.js")
	}
}

function listServerCosts(ns: NS) {
	const serverCount = ns.getPurchasedServerLimit()
	const servers = getServerSizes(ns, true)

	const ramTable = new Table({defaultWidth:20})
	ramTable.addColumn({headerText:"RAM Amount",fieldType:"ram"})
	ramTable.addColumn({headerText:"Server Cost",fieldType:"number"})
	ramTable.addColumn({headerText:serverCount + "x Cost",fieldType:"number"})
	ramTable.addColumn({headerText:serverCount + "x Upgrade",fieldType:"number"})
	ramTable.addColumn({headerText:"Upgrade Existing",fieldType:"number"})
	let size = 1
	let prevTotal = 0
	do {
		size *= 2
		const cost = ns.getPurchasedServerCost(size)
		const total = cost * serverCount

		// Calculate cost to upgrade all existing servers to this size
		let upgradeCost = 0
		for (const {hostname, maxRam} of servers) {
			if (maxRam < size) {
				upgradeCost += ns.getPurchasedServerUpgradeCost(hostname, size)
			}
		}

		ramTable.addRow([size, cost, total, total - prevTotal, upgradeCost])
		prevTotal = serverCount * cost
	} while (size < ns.getPurchasedServerMaxRam())

	ramTable.printToTerminal(ns)
}

/**
 * Buy a single big server and upgrade it as much as possible given the budget.
 * More strictly a greedy strategy where we buy the biggest upgrades available.
 */
function tallStrategy(ns: NS, budget: number): boolean {
	const servers = getServerSizes(ns)
	const maxServers = ns.getPurchasedServerLimit()
	let serverCount = servers.length
	let remainingBudget = budget

	for (const {hostname, maxRam} of servers) {
		const {size, cost} = biggestUpgradeForBudget(ns, hostname, remainingBudget)
		if (size > maxRam && ns.upgradePurchasedServer(hostname, size)) {
			remainingBudget -= cost
			ns.tprintf("Purchased %s upgrade to %s", ns.formatRam(size), hostname)
		}
	}
	while (serverCount < maxServers) {
		const {size, cost} = biggestPurchaseForBudget(ns, remainingBudget)
		if (size > 0 && purchaseNextServer(ns, size)) {
			remainingBudget -= cost
			serverCount++;
		} else {
			break
		}
	}
	return remainingBudget !== budget
}

/**
 * Buy as many servers as the budget will allow. Hard limit where we won't buy
 * servers smaller than 64GiB because they're just too small.
 */
function wideStrategy(ns: NS, budget: number): boolean {
	const servers = getServerSizes(ns)
	const maxServers = ns.getPurchasedServerLimit()
	let serverCount = servers.length
	const perServerBudget = budget / maxServers
	let remainingBudget = budget

	while (serverCount < maxServers) {
		const {size, cost} = biggestPurchaseForBudget(ns, perServerBudget)
		if (size > 0 && purchaseNextServer(ns, size)) {
			remainingBudget -= cost
			serverCount++;
		} else {
			break
		}
	}
	for (const {hostname, maxRam} of servers) {
		const {size, cost} = biggestUpgradeForBudget(ns, hostname, perServerBudget)
		if (size > maxRam && ns.upgradePurchasedServer(hostname, size)) {
			ns.tprintf("Purchased %s upgrade to %s", ns.formatRam(size), hostname)
			remainingBudget -= cost
		}
	}
	return remainingBudget !== budget
}

function getServerSizes(ns: NS, ascending = false) {
	const hostnames = ns.getPurchasedServers()
	const servers = hostnames.map(hostname => ({
		hostname: hostname,
		maxRam: ns.getServerMaxRam(hostname)
	}))
	if (ascending) {
		servers.sort((a, b) => a.maxRam - b.maxRam)
	} else {
		servers.sort((a, b) => b.maxRam - a.maxRam)
	}
	return servers
}

function biggestPurchaseForBudget(ns: NS, budget: number) {
	let size = ns.getPurchasedServerMaxRam()
	do {
		const cost = ns.getPurchasedServerCost(size)
		if (cost < budget) {
			return {
				size: size,
				cost: cost
			}
		}
		size /= 2
	} while (size >= 64)
	return {
		size: 0,
		cost: 0
	}
}

function biggestUpgradeForBudget(ns: NS, hostname: string, budget: number) {
	const baseSize = ns.getServerMaxRam(hostname)
	let size = ns.getPurchasedServerMaxRam()
	while (baseSize < size) {
		const cost = ns.getPurchasedServerUpgradeCost(hostname, size)
		if (cost < budget) {
			return {
				size: size,
				cost: cost
			}
		}
		size /= 2
	}
	return {
		size: 0,
		cost: 0
	}
}

function purchaseNextServer(ns: NS, size: number) {
	const prefix = "cluster-"
	for (let i = 0; i < ns.getPurchasedServerLimit(); i++) {
		const serverName = prefix + i
		if (!ns.serverExists(serverName)) {
			let purchasedName = ns.purchaseServer(serverName, size)
			if (purchasedName) {
				ns.tprintf("Purchased %s", purchasedName)
				return purchasedName
			}
			else {
				ns.tprintf("Failed to purchase %s", serverName)
				return ""
			}
		}
	}
	return ""
}