import {
	BladeburnerActionName,
	BladeburnerActionType,
	BladeburnerSkillName,
	CityName,
	NS,
} from "@ns"
import BladeburnerAction from "/lib/bladeburner-action"
import Table from "lib/tables"

export async function main(ns: NS) {
	while(true) {
		const skillsToBuy = analyzeActions(ns)
		if (buySkills(ns, skillsToBuy)) {
			ns.printf("Buying Skills!!!!!")
		} else {
			await ns.bladeburner.nextUpdate()
		}
		
	}
}

const MONEY: BladeburnerSkillName[] = ["Hands of Midas"] as BladeburnerSkillName[]
const HYPERDRIVE: BladeburnerSkillName[] = ["Hyperdrive"] as BladeburnerSkillName[]
const STAT_BOOSTERS: BladeburnerSkillName[] = ["Reaper", "Evasive System"] as BladeburnerSkillName[]
const CHANCE_BOOSTERS: BladeburnerSkillName[] =
	["Blade's Intuition", "Cloak", "Short-Circuit", "Digital Observer"] as BladeburnerSkillName[]

function buySkills(ns: NS, skills: BladeburnerSkillName[]): boolean {
	const bb = ns.bladeburner
	const budget = bb.getSkillPoints()
	let maxLevel = 0
	for (const skill of skills) {
		const level = bb.getSkillLevel(skill)
		if (level > maxLevel) {
			maxLevel = level
		}
	}
	const newLevel = maxLevel + 10
	let totalCost = 0
	for (const skill of skills) {
		const level = bb.getSkillLevel(skill)
		totalCost += bb.getSkillUpgradeCost(skill, newLevel - level)
	}
	if (totalCost > budget) {
		return false
	} else {
		for (const skill of skills) {
			const level = bb.getSkillLevel(skill)
			bb.upgradeSkill(skill, newLevel - level)
		}
		return true
	}
}

function getOrderOfMagnitude(skill: number):number {
	return Math.pow(10, Math.ceil(Math.log10(skill)))
}

function analyzeActions(ns: NS): BladeburnerSkillName[] {
	const assassination = new BladeburnerAction(ns,
		"Operations" as BladeburnerActionType,
		"Assassination" as BladeburnerActionName)
	const [_, high] = assassination.chances
	if (high < 1) {
		return CHANCE_BOOSTERS
	}
	const time = assassination.time / 1000
	if (time > 15) {
		return STAT_BOOSTERS
	}
	return HYPERDRIVE
}
