import { NS, CrimeType } from "@ns"
import Table from "lib/tables"

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const flags = ns.flags([
		["list", false],
		["commit", false],
	])

	const crimeStats = getCrimeStats(ns)

	if (flags["list"]) {
		listCrimes(ns)
		return
	}
	if (flags["commit"]) {
		ns.singularity.commitCrime("Homicide", false)
	}
}

function listCrimes(ns: NS): void {
	const s = ns.singularity
	const w = ns.formulas.work

	const p = ns.getPlayer()

	for (const crime of Object.values(ns.enums.CrimeType)) {
		const crimeStats = s.getCrimeStats(crime)
		const crimeTime = crimeStats.time
		const crimeMoney = w.crimeGains(p, crime).money
		const crimeChance = w.crimeSuccessChance(p, crime)
		const moneyPerSecond = crimeMoney * crimeChance * 1000 / crimeTime

		ns.tprintf("%20s%15s%15s%25s%15.0d",
			crime, ns.format.number(crimeMoney), ns.format.percent(crimeChance), ns.format.time(crimeTime), moneyPerSecond)
	}
	ns.tprintf("----------------------------------------------------------------------------------------------")
	ns.tprintf("Karma:%15d", ns.heart.break())
}

function getCrimeStats(ns: NS): CurrentCrimeStats[] {
	const s = ns.singularity
	const w = ns.formulas.work

	const p = ns.getPlayer()
	const retVal: CurrentCrimeStats[] = []
	// The CrimeType enum's values are both the API token and the display name
	for (const crime of Object.values(ns.enums.CrimeType)) {
		const crimeStats = s.getCrimeStats(crime)
		const crimeGains = w.crimeGains(p, crime)
		retVal.push({
			crimeType: crime,
			crimeName: crime,
			crimeTime: crimeStats.time,
			crimeMoney: crimeGains.money,
			crimeKarma: crimeStats.karma,
			crimeChance: w.crimeSuccessChance(p, crime)
		})
	}
	return retVal
}

interface CurrentCrimeStats {
	crimeType: CrimeType
	crimeName: string
	crimeTime: number
	crimeMoney: number
	crimeKarma: number
	crimeChance: number
}