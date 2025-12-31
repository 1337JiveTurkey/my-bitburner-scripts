import { NS } from "@ns"

export async function main(ns: NS) {
}

async function canStartGang(ns: NS): Promise<BNGoal.CanStartGang> {
	while (true) {
		if (ns.heart.break() <= -54000) {
			return BNGoal.CanStartGang
		}
		await ns.sleep(60000)
	}
}

async function canBladeburn(ns: NS): Promise<BNGoal.CanBladeburn> {
	while (true) {
		const skills = ns.getPlayer().skills
		if (skills.strength >= 100 &&
			skills.defense >= 100 &&
			skills.dexterity >= 100 &&
			skills.agility >= 100) {
			return BNGoal.CanBladeburn
		}
		await ns.asleep(60000)
	}
}

export enum BNGoal {
	CanBladeburn,
	CanStartGang
}