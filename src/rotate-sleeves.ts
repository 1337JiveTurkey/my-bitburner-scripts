import { NS } from "@ns"

export async function main(ns: NS) {
	const s = ns.sleeve
	do {
		const maxSleeve = mostStoredCycles(ns)
		if (maxSleeve < 0) {
			await ns.sleep(600000)
			continue
		}
		setSleeveJobs(ns, maxSleeve)
		do {
			const cycles = s.getSleeve(maxSleeve).storedCycles
			if (cycles <= 0) {
				break
			}
			await ns.sleep(60000)
		} while (true)
	} while (true)
}

/**
 * Finds the sleeve number with the most stored cycles.
 */
function mostStoredCycles(ns: NS): number {
	const s = ns.sleeve
	const total = s.getNumSleeves()
	let maxCycles = 0
	let maxSleeve = -1
	for (let i = 0; i < total; i++) {
		const cycles = s.getSleeve(i).storedCycles
		if (cycles > maxCycles) {
			maxCycles = cycles
			maxSleeve = i
		}
	}
	return maxSleeve
}

function setSleeveJobs(ns: NS, maxSleeve: number) {
	const s = ns.sleeve
	const total = s.getNumSleeves()
	for (let i = 0; i < total; i++) {
		if (i == maxSleeve) {
			s.setToBladeburnerAction(i, "Infiltrate Synthoids")
		} else {
			s.setToIdle(i)
		}
	}
}