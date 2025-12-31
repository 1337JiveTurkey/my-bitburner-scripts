import {GymType, NS} from "@ns"

export async function main(ns: NS) {
	const s = ns.sleeve
	const numSleeves = s.getNumSleeves()
	for (let i = 0; i < numSleeves; i++) {
//		install(ns, i)
//		algorithms(ns, i)
//		leadership(ns, i)
//		gym(ns, i)
//		s.setToCommitCrime(i, "Mug")
		s.setToCommitCrime(i, "Homicide")
//		s.setToBladeburnerAction(i, "Training")
//		s.setToBladeburnerAction(i, "Recruitment")
//		s.setToBladeburnerAction(i, "Hyperbolic Regeneration Chamber")
//		s.setToBladeburnerAction(i, "Field Analysis")
//		s.setToBladeburnerAction(i, "Support main sleeve")
//		s.setToBladeburnerAction(i, "Take on contracts", "Tracking")
//		s.setToBladeburnerAction(i, "Diplomacy")
	}
}

async function shockRecovery(ns: NS, shock: number) {
	const s = ns.sleeve
	const numSleeves = s.getNumSleeves()
	for (let i = 0; i < numSleeves; i++) {

	}
}

function algorithms(ns: NS, i: number) {
	const s = ns.sleeve
	if (s.getSleeve(i).city != "Volhaven") {
		s.travel(i, "Volhaven")
	}
	s.setToUniversityCourse(i, "ZB Institute of Technology", "Algorithms")
}

function leadership(ns: NS, i: number) {
	const s = ns.sleeve
	if (s.getSleeve(i).city != "Volhaven") {
		s.travel(i, "Volhaven")
	}
	s.setToUniversityCourse(i, "ZB Institute of Technology", "Leadership")
}

function gym(ns: NS, i: number) {
	const s = ns.sleeve
	if (s.getSleeve(i).city != "Sector-12") {
		s.travel(i, "Sector-12")
	}
	let stat = ""
	switch (i % 4) {
		case 0:
			stat = "strength"
			break
		case 1:
			stat = "defense"
			break
		case 2:
			stat = "dexterity"
			break
		case 3:
			stat = "agility"
			break
	}
	s.setToGymWorkout(i, "Powerhouse Gym", stat as GymType)
}

function install(ns: NS, i: number) {
	const s = ns.sleeve
	const augs = s.getSleevePurchasableAugs(i)
	for (const aug of augs) {
		if (aug.cost < 1_000_000_000_000)
			s.purchaseSleeveAug(i, aug.name)
	}
}