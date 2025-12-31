import { NS, Multipliers } from "@ns"

export async function main(ns: NS)  {

}

const AT = [
	"Augmented Targeting I",
	"Augmented Targeting II",
	"Augmented Targeting III",
]
const CR = [
	"Combat Rib I",
	"Combat Rib II",
	"Combat Rib III",
]
const CSP = [
	"Cranial Signal Processors - Gen I",
	"Cranial Signal Processors - Gen II",
	"Cranial Signal Processors - Gen III",
	"Cranial Signal Processors - Gen IV",
	"Cranial Signal Processors - Gen V",
]
const PCDNI = [
	"PC Direct-Neural Interface",
	"PC Direct-Neural Interface Optimization Submodule",
	"PC Direct-Neural Interface NeuroNet Injector",
]

/**
 * Gets a simplified system of what an aug modifies for further analysis.
 * @param stats The stat multipliers for the augmentation.
 */
export function getAugFlags(stats: Multipliers): string[] {
	const flags = []
	if (nonzero(stats.agility, stats.agility_exp,
		stats.defense, stats.defense_exp,
		stats.dexterity, stats.dexterity_exp,
		stats.strength, stats.strength_exp)) {
		flags.push("combat")
	}
	if (nonzero(stats.hacknet_node_core_cost,
		stats.hacknet_node_level_cost,
		stats.hacknet_node_money,
		stats.hacknet_node_purchase_cost,
		stats.hacknet_node_ram_cost)) {
		flags.push("hacknet")
	}
	if (nonzero(stats.bladeburner_analysis,
		stats.bladeburner_max_stamina,
		stats.bladeburner_stamina_gain,
		stats.bladeburner_success_chance)) {
		flags.push("bladeburner")
	}
	if (nonzero(stats.crime_money, stats.crime_success)) {
		flags.push("crime")
	}
	if (nonzero(stats.charisma, stats.charisma_exp)) {
		flags.push("charisma")
	}
	if (nonzero(stats.work_money, stats.company_rep)) {
		flags.push("work")
	}
	if (nonzero(stats.faction_rep)) {
		flags.push("rep")
	}
	if (nonzero(stats.hacking,
		stats.hacking_chance,
		stats.hacking_exp,
		stats.hacking_grow,
		stats.hacking_money,
		stats.hacking_speed)) {
		flags.push("hacking")
	}
	return flags
}

function nonzero(...multipliers: number[]) {
	for (const m of multipliers) {
		if (m !== 1) {
			return true
		}
	}
	return false
}