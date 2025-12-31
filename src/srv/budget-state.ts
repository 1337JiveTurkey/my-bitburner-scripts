import { NS } from "@ns"

const BUDGET_FILE = "/state/budget.json"

/**
 * Script that figures out what money can be spent by other scripts.
 */
export async function main(ns: NS) {
	ns.disableLog("ALL")
	const flags = ns.flags([
		["server", false],
	])

	do {
		const moneySources = ns.getMoneySources().sinceInstall

		const jsonBudget: BudgetState = {
			total:   ns.getPlayer().money,
			hackNet: moneySources["hacknet"] + moneySources.hacknet_expenses,
			sleeves: moneySources.crime + moneySources.sleeves,
			servers: moneySources.hacking + moneySources.servers,
			gang:    moneySources.gang + moneySources.gang_expenses,
		}

		ns.write(BUDGET_FILE, JSON.stringify(jsonBudget, null, 2) , "w")
		if (!flags["server"]) {
			break;
		}
		await ns.asleep(60000)
	} while (true)
}


/** @param {NS} ns */
export function getBudgetState(ns: NS): BudgetState {
	const state = ns.read(BUDGET_FILE)
	if (state === "") {
		return {
			total: 0,
			hackNet: 0,
			sleeves: 0,
			servers: 0,
			gang: 0,
		}
	} else {
		return JSON.parse(state)
	}
}

interface BudgetState {
	total: number
	hackNet: number
	sleeves: number
	servers: number
	gang: number
}
