import { NS } from "@ns"
import AbstractGoal from "/goals/abstract-goal";

export async function main(ns: NS) {
	new JoinBladeburners(ns)
}

class JoinBladeburners extends AbstractGoal {
	canComplete(): boolean {
		const skills = this.ns.getPlayer().skills
		return skills.strength >= 100 &&
			skills.defense >= 100 &&
			skills.dexterity >= 100 &&
			skills.agility >= 100;

	}

	doComplete(): void {
		this.ns.bladeburner.joinBladeburnerDivision()
	}

}