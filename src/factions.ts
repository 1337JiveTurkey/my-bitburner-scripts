import { NS, Multipliers } from "@ns"
import { getAugFlags } from "/lib/augmentation";

const workTypes = ["field", "hacking", "security"]

export async function main(ns: NS) {
	const s = ns.singularity

//	const invitations = s.checkFactionInvitations()
	const factionNames = ns.getPlayer().factions

	for (const factionName of factionNames) {
		const factionStats = analyzeFaction(ns, factionName)
	}
}

function analyzeFaction(ns: NS, factionName: string) {
	const s = ns.singularity
	const w = ns.formulas.work
	const player = ns.getPlayer()
	const currentRep = s.getFactionRep(factionName)
	const currentFavor = s.getFactionFavor(factionName)
	const workTypes = s.getFactionWorkTypes(factionName)
	for (const workType of workTypes) {
		w.factionGains(player, workType, currentFavor)
	}

	const ownedAugs = new Set(s.getOwnedAugmentations(true))
	const augs = []
	const augNames = s.getAugmentationsFromFaction(factionName)
	let maxAugRep = 0
	let maxUniqueAugRep = 0
	for (const augName of augNames) {
		if (ownedAugs.has(augName)) {
			continue
		}
		const augFactions = s.getAugmentationFactions(augName)
		const unique = augFactions.length === 1
		const rep = s.getAugmentationRepReq(augName)
		const price = s.getAugmentationBasePrice(augName)
		if (rep > maxAugRep) {
			maxAugRep = rep
		}
		if (unique && rep > maxUniqueAugRep) {
			maxUniqueAugRep = rep
		}
		const flags = getAugFlags(s.getAugmentationStats(augName))
		augs.push({
			name: augName,
			price,
			rep,
			unique,
			flags
		})
	}

	return {
		name: factionName,
		currentRep,
		currentFavor,
		maxAugRep,
		maxUniqueAugRep,
		augs
	}
}

