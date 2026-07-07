import { NS, FactionName } from "@ns"
import AbstractGoal from "/goals/abstract-goal";

export async function main(ns: NS) {
	new JoinFaction(ns, "Slum Snakes")
}

class JoinFaction extends AbstractGoal {
	readonly faction: FactionName

	constructor(ns: NS, faction: FactionName) {
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