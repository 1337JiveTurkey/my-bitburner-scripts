import { NS } from "@ns"

const GANG_FILE = "/state/gang.json"

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const flags = ns.flags([
		["server", false],
	])
	do {
		const inGang = ns.gang.inGang()
		if (inGang) {
			const jsonGangInfo = manageGang(ns)
			ns.write(GANG_FILE, JSON.stringify(jsonGangInfo, null, 2) , "w")
		} else {
			// TODO Create gang here or sub out to another script
			ns.clear(GANG_FILE)
		}
		if (!flags["server"]) {
			break;
		}
		await ns.asleep(60000)
	} while (true)
}

function manageGang(ns: NS): GangState {
	const myGangInfo = ns.gang.getGangInformation()
	const faction = myGangInfo.faction

	const ourGangPower = myGangInfo.power
	let opposingGangPower = 0
	let territory = myGangInfo.territory

	const otherGangs = ns.gang.getOtherGangInformation()
	for (const [name, info] of Object.entries(otherGangs)) {
		if (name !== faction && info.territory > 0) {
			opposingGangPower += info.power
		}
	}
	return {
		faction: faction,
		power: ourGangPower,
		opposingGangPower,
		territory,
	}
}

/** @param {NS} ns */
export function getGangState(ns: NS): GangState|null {
	const state = ns.read(GANG_FILE)
	if (state === "") {
		return null
	} else {
		return JSON.parse(state)
	}
}

interface GangState {
	faction: string
	power: number
	opposingGangPower: number
	territory: number
}

interface MemberState {

}