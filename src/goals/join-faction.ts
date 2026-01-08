import { NS } from "@ns"
import AbstractGoal from "/goals/abstract-goal";

export async function main(ns: NS) {
	new JoinFaction(ns, "Slum Snakes")
}

class JoinFaction extends AbstractGoal {
	readonly faction: string

	constructor(ns: NS, faction: string) {
		super(ns);
		this.faction = faction;
	}

	canComplete(): boolean {
		return this.ns.singularity.checkFactionInvitations().includes(this.faction)
	}

	doComplete(): void {
		this.ns.singularity.joinFaction(this.faction)
	}

}