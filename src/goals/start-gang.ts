import { NS, FactionName } from "@ns"
import AbstractGoal from "/goals/abstract-goal";

export async function main(ns: NS) {
	new StartGang(ns, "Slum Snakes")
}

class StartGang extends AbstractGoal {
	readonly faction: FactionName

	constructor(ns: NS, faction: FactionName) {
		super(ns);
		this.faction = faction;
	}

	canComplete(): boolean {
		return this.ns.getPlayer().factions.includes(this.faction) && this.ns.heart.break() < -54000;
	}

	doComplete(): void {
		this.ns.gang.createGang(this.faction)
	}

}