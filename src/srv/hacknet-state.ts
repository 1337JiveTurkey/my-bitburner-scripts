import { NS } from "@ns"
import { getBudgetState } from "srv/budget-state"


const HACKNET_FILE = "/state/hacknet.json"

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const flags = ns.flags([
		["server", false],
		["study", 0],
		["training", 0],
		["corporation", 0]
	])
	const hn = ns.hacknet

	do {
		const jsonBudget = getBudgetState(ns)
		const currentBudget = Math.min(jsonBudget.total, jsonBudget.hackNet)
		if (currentBudget > 0) {
			buyHacknetServers(ns, currentBudget, 15, {level: 100, ram: 15, cores: 20})
		}

		const gymTarget = Number(flags["training"])
		const uniTarget = Number(flags["study"])
		const corpTarget = Number(flags["corporation"])
		
		const jsonHacknet: HacknetState = {
			gymTarget: gymTarget,
			uniTarget: uniTarget,
			corpTarget: corpTarget,
			gymLevel: buyGym(ns, gymTarget),
			uniLevel: buyStudy(ns, uniTarget),
			corpLevel: buyHacknetUpgrade(ns, upgrades.funds, corpTarget)
		}
//		hackServer(ns, "rho-construction")

		ns.write(HACKNET_FILE, JSON.stringify(jsonHacknet, null, 2) , "w")
		if (!flags["server"]) {
			break;
		}
		await ns.asleep(60000)
	} while (true)
}

/**
 * Buys new hacknet servers each turn based on the current budget and what's
 * available.
 */
function buyHacknetServers(ns: NS, currentBudget: number, count: number, upgrade: HacknetUpgrade = {}) {
	const hn = ns.hacknet

	const numNodes = hn.numNodes()
	const maxNodes = hn.maxNumNodes()
	if (count >= maxNodes) {
		count = maxNodes
	}
	for (let nodeID = 0; nodeID < count; nodeID++) {
		// Check if we need to buy a new node
		if (nodeID >= numNodes) {
			const newNodePrice = hn.getPurchaseNodeCost()
			if (newNodePrice < currentBudget) {
				const newNode = hn.purchaseNode()
				if (newNode !== nodeID) {
					ns.tprintf("ERROR: Expected to create hacknet node %i but got %i", nodeID, newNode)
				}
				currentBudget -= newNodePrice
			} else {
				// Can't afford anything more so we're done here
				break
			}
		}
		const upgradePrice = getUpgradePrice(ns, nodeID, upgrade)
		if (upgradePrice < currentBudget) {
			currentBudget -= upgradePrice
			doUpgrade(ns, nodeID, upgrade)
		} else {
			const smallerUpgrade = getSmallerUpgrade(ns, nodeID, upgrade)
			const smallerPrice = getUpgradePrice(ns, nodeID, smallerUpgrade)
			if (smallerPrice < currentBudget) {
				currentBudget -= smallerPrice
				doUpgrade(ns, nodeID, smallerUpgrade)
			}
		}
	}
}

/**
 * Gets the price of upgrading a hacknet server to a new set of stats.
 */
function getUpgradePrice(ns: NS, nodeID: number, {level=10, ram=1, cores=1, cache=1} = {}): number {
	const hn = ns.hacknet

	const node = hn.getNodeStats(nodeID)
	const levelUpgradeRequired = node.level - level
	const ramUpgradeRequired   = node.ram   - ram
	const coreUpgradeRequired  = node.cores - cores
	const cacheUpgradeRequired = node.cache? node.cache - cache : 0

	let total = 0
	if (levelUpgradeRequired > 0)
		total += hn.getLevelUpgradeCost(nodeID, levelUpgradeRequired)
	if (ramUpgradeRequired > 0)
		total += hn.getRamUpgradeCost(nodeID, ramUpgradeRequired)
	if (coreUpgradeRequired > 0)
		total += hn.getCoreUpgradeCost(nodeID, coreUpgradeRequired)
	if (cacheUpgradeRequired > 0)
		total += hn.getCacheUpgradeCost(nodeID, cacheUpgradeRequired)
	return total
}

/**
 * Upgrades a hacknet server to a new set of stats. Assumes that the
 * amount of money has been checked earlier and is sufficient. If not
 * this will just buy what it can and return normally.
 */
function doUpgrade(ns: NS, nodeID: number, {level=10, ram=1, cores=1, cache=1} = {}) {
	const hn = ns.hacknet

	const node = hn.getNodeStats(nodeID)
	const levelUpgradeRequired = node.level - level
	const ramUpgradeRequired   = node.ram   - ram
	const coreUpgradeRequired  = node.cores - cores
	const cacheUpgradeRequired = node.cache? node.cache - cache : 0

	if (levelUpgradeRequired > 0)
		hn.upgradeLevel(nodeID, levelUpgradeRequired)
	if (ramUpgradeRequired > 0)
		hn.upgradeLevel(nodeID, ramUpgradeRequired)
	if (coreUpgradeRequired > 0)
		hn.upgradeCore(nodeID, coreUpgradeRequired)
	if (cacheUpgradeRequired > 0)
		hn.upgradeCache(nodeID, cacheUpgradeRequired)
}

/**
 * Tries to get a cheaper upgrade within the budget.
 */
function getSmallerUpgrade(ns: NS, nodeID: number, upgrade: HacknetUpgrade): HacknetUpgrade {
	const retVal: HacknetUpgrade = {}
	const node = ns.hacknet.getNodeStats(nodeID)
	if (upgrade.level && node.level > upgrade.level)
		retVal.level = (upgrade.level + node.level) / 2
	if (upgrade.ram && node.ram > upgrade.ram)
		retVal.ram = (upgrade.ram + node.ram) / 2
	if (upgrade.cores && node.cores > upgrade.cores)
		retVal.cores = (upgrade.cores + node.cores) / 2
	if (upgrade.cache && node.cache && node.cache > upgrade.cache)
		retVal.cache = (upgrade.cache + node.cache) / 2

	return retVal
}

/**
 * Targets a server using hacknet resources to make it more vulnerable
 * to hacking. This buys money and security upgrades simultaneously
 * when they both become affordable at once.
 */
function hackServer(ns: NS, serverName: string) {
	const hn = ns.hacknet
	const hashes = hn.numHashes()
	const moneyCost = hn.hashCost(upgrades.hackMoney)
	const securityCost = hn.hashCost(upgrades.hackSecurity)
	if (moneyCost + securityCost < hashes) {
		hn.spendHashes(upgrades.hackMoney, serverName)
		hn.spendHashes(upgrades.hackSecurity, serverName)
	}
}

function buyHacknetUpgrade(ns: NS, upgradeName: string, target: number): number {
	const hn = ns.hacknet
	const currentLevel = hn.getHashUpgradeLevel(upgradeName)
	if (currentLevel >= target) {
		return currentLevel
	}
	const hashes = hn.numHashes()
	const upgradeCost = hn.hashCost(upgradeName)
	if (upgradeCost <= hashes) {
		hn.spendHashes(upgradeName)
	}
	return hn.getHashUpgradeLevel(upgradeName)
}

function buyGym(ns: NS, gymTarget: number) {
	return buyHacknetUpgrade(ns, upgrades.gym, gymTarget)
}

function buyStudy(ns: NS, uniTarget: number) {
	return buyHacknetUpgrade(ns, upgrades.study, uniTarget)
}

const upgrades = {
	money: "Sell for Money",
	funds: "Sell for Corporation Funds",
	hackSecurity: "Reduce Minimum Security",
	hackMoney: "Increase Maximum Money",
	study: "Improve Studying",
	gym: "Improve Gym Training",
	research: "Exchange for Corporation Research",
	bbRank: "Exchange for Bladeburner Rank",
	bbSp: "Exchange for Bladeburner SP",
	contract: "Generate Coding Contract",
	favor: "Company Favor",
}

/**
 * Returns the hacknet state of the system as last calculated.
 */
export function getHacknetState(ns: NS): HacknetState {
	const state = ns.read(HACKNET_FILE)
	if (state === "") {
		return {
			gymLevel: 0,
			uniLevel: 0,
			corpLevel: 0,
		}
	} else {
		return JSON.parse(state)
	}
}

interface HacknetState {
	gymLevel: number,
	gymTarget?: number,
	uniLevel: number,
	uniTarget?: number,
	corpLevel: number,
	corpTarget?: number,
}

/**
 * A set of four stats that can be upgraded when upgrading a hacknet server
 */
interface HacknetUpgrade {
	level?: number,
	ram?: number,
	cores?: number,
	cache?: number
}