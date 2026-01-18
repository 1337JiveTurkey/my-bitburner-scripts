import {
	BladeburnerSkillName,
	NS,
} from "@ns"
import BladeburnerAction from "/lib/bladeburner-action"

export async function main(ns: NS) {
	while(true) {
		const nextAction = selectAction(ns)
		const skillsToBuy = selectSkills(ns)
		if (buySkills(ns, skillsToBuy)) {
			ns.printf("Buying Skills!!!!!")
		}

		nextAction.start()
		await nextActionComplete(ns)
	}
}

const MONEY: BladeburnerSkillName[] = ["Hands of Midas"] as BladeburnerSkillName[]
const HYPERDRIVE: BladeburnerSkillName[] = ["Hyperdrive"] as BladeburnerSkillName[]
const OVERCLOCK: BladeburnerSkillName[] = ["Overclock"] as BladeburnerSkillName[]
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
	const newLevel: number = maxLevel >= 1000? maxLevel + 100 :
	                         maxLevel >= 100?  maxLevel + 10  :
	                                           maxLevel + 1
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

function selectAction(ns: NS): BladeburnerAction {
	const bb = ns.bladeburner

	const [current, max] = bb.getStamina()
	if (current < max / 2) {
		return BladeburnerAction.regeneration(ns)
	}

	// Top priority is Black Ops if we can do them
	const blackOp = BladeburnerAction.nextBlackOp(ns)
	if (blackOp) {
		const [low, high] = blackOp.chances
		const sufficientRank = blackOp.rankRequirementMet
		if (low === 1 && sufficientRank) {
			return blackOp
		}
	}

	if (bb.getCityChaos(bb.getCity()) > 50) {
		return BladeburnerAction.diplomacy(ns)
	}

	const actionsByPriority = [
		BladeburnerAction.assassination(ns),
		BladeburnerAction.undercoverOp(ns),
		BladeburnerAction.investigation(ns),
		BladeburnerAction.tracking(ns)
	]

	for (const action of actionsByPriority) {
		const [low, high] = action.chances
		if (low !== high) {
			return BladeburnerAction.analysis(ns)
		}
		const remaining = action.countRemaining
		if (low === 1 && remaining > 0) {
			return action
		}
	}

	return BladeburnerAction.training(ns)
}

function selectSkills(ns: NS): BladeburnerSkillName[] {
	const assassination = BladeburnerAction.assassination(ns)
	let current = BladeburnerAction.current(ns)?? assassination

	let skillPriority: BladeburnerSkillName[]
	const [low, high] = assassination.chances
	const time = assassination.time / 1000
	if (low < 1) {
		skillPriority = CHANCE_BOOSTERS
	} else if (time > 15) {
		if (ns.bladeburner.getSkillLevel("Overclock") < 90) {
			skillPriority = OVERCLOCK
		}
		else {
			skillPriority = STAT_BOOSTERS
		}
	} else {
		skillPriority = HYPERDRIVE
	}
	return skillPriority
}


async function nextActionComplete(ns: NS): Promise<void> {
	let current = ns.bladeburner.getCurrentAction()
	do {
		const timeWaited = await ns.bladeburner.nextUpdate()
		const timeSpent = ns.bladeburner.getActionCurrentTime()
		// Action time should increment in seconds
		if (timeSpent < timeWaited) {
			return
		}
		current = ns.bladeburner.getCurrentAction()
	} while (current)
}
