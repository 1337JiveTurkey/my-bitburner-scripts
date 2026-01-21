import {GangMemberInfo, NS} from "@ns"
import {GangInterface} from "/lib/gang/interface";
import Log from "/lib/logging";

const gangNames = [
	"Adalberto",
	"Chaz",
	"Frankie",
	"Geraldo",
	"Isambard",
	"Lennart",
	"Murgatroyd",
	"Nigel",
	"Olaf",
	"Parsifal",
	"Quint",
	"Rudolf",
	"Slappy",
	"Tannhauser",
	"Ulrich",
	"Vladimir",
	"Wendell",
	"Xenia",
	"Yvonne",
	"Zelda"
]

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const flags = ns.flags([
		["server", false],
		["no-ascend", false],
		["no-equip", false],
		["no-recruit", false],
		["no-warfare", false],
	])

	const log = new Log(ns).level("FINE").toTail()
	const gang = new GangInterface(ns, log)

	if (!ns.gang.inGang()) {
		if (ns.heart.break() <= -54000) {
			ns.gang.createGang(ns.enums.FactionName.SlumSnakes)
		} else {
			log.error("Couldn't create gang Slum Snakes")
			return
		}
	}
	while (true) {
		if (!flags["no-recruit"]) {
			doRecruitMembers(ns)
		}
		const gangMembers = ns.gang.getMemberNames()

		const budget = ns.getPlayer().money / gangMembers.length

		// Test of new dodged functions
		if (!flags["no-equip"]) {
			log.info(await gang.equipMembers({ members: gangMembers, budget }))
		}
		if (!flags["no-ascend"]) {
			log.info(await gang.ascendMembers(gangMembers))
		}
		if (!flags["no-warfare"]) {
			doTerritoryWarfare(ns)
		}

		if (!flags["server"]) {
			break;
		}
		await ns.gang.nextUpdate()
	}
}

function doRecruitMembers(ns: NS) {
	const extantNames = new Set(ns.gang.getMemberNames())
	const usableNames = gangNames.filter(name => !extantNames.has(name))
	for (const m of usableNames) {
		if (!ns.gang.canRecruitMember()) {
			break
		}
		ns.gang.recruitMember(m)
		ns.gang.setMemberTask(m, "Train Combat")
	}
}

function doTerritoryWarfare(ns: NS) {
	const gangInfo = ns.gang.getGangInformation()
	const gangName = gangInfo.faction
	const ourGangPower = gangInfo.power
	let opposingGangPower = 0
	const otherGangs = ns.gang.getOtherGangInformation()
	for (const [name, info] of Object.entries(otherGangs)) {
		if (name !== gangName && info.territory > 0) {
			opposingGangPower += info.power
		}
	}
	if (ourGangPower > 2 * opposingGangPower) {
		ns.gang.setTerritoryWarfare(true)
	}
}

interface Members {[name: string]: GangMemberInfo}

function getMembers(ns: NS): Members {
	const memberNames = ns.gang.getMemberNames()
	const members: Members = {}
	for (const m of memberNames) {
		members[m] = ns.gang.getMemberInformation(m)
	}
	return members
}

interface TaskInfo {
	taskName: string
	difficulty: number
	gains: GainsInfo
}
interface GainsInfo {[memberName: string]: {
		memberName: string
		money: number
		respect: number
		wanted: number
	}
}

/**
 * Gets the per-member stats about the various combat tasks such as how much
 * money, wanted level and respect the gang will gain with each.
 *
 * @param ns The NS like always
 * @param gangMembers All members that can complete tasks
 */
function getAllTaskInfo(ns: NS, gangMembers: Members): TaskInfo[] {
	const ng = ns.gang
	const nfg = ns.formulas.gang
	const gangInfo = ng.getGangInformation()
	const gangTasks = ng.getTaskNames()
	const res: TaskInfo[] = []
	for (const t of gangTasks) {
		const stats = ng.getTaskStats(t)
		if (!stats.isCombat) {
			continue
		}
		const gains: GainsInfo = {}
		for (const m in gangMembers) {
			const memberInfo = gangMembers[m]
			const money = nfg.moneyGain(gangInfo, memberInfo, stats)
			const respect = nfg.respectGain(gangInfo, memberInfo, stats)
			const wanted = nfg.wantedLevelGain(gangInfo, memberInfo, stats)
			gains[m] = {
				memberName: m,
				money,
				respect,
				wanted
			}
		}
		res.push({
			taskName: t,
			difficulty: stats.difficulty,
			gains
		})
	}
	// ns.tprint(JSON.stringify(res, null, 2))
	return res
}

/**
 * Sets the tasks of all the members of the gang based on their previous
 * tasks. The second parameter is a list of string pairs with the old
 * task followed by the new task. All old tasks are evaluated before
 * changing tasks so that there won't be any situations where
 * task1 -> task2 and task2 -> task3 results in task1 -> task3.
 */
function setMemberTasks(ns: NS, taskPairs: [string, string][]): void {
	const newAssignments: Map<string, string> = new Map()
	for (const name of ns.gang.getMemberNames()) {
		for (const [oldTask, newTask] of taskPairs) {
			if (ns.gang.getMemberInformation(name).task == oldTask) {
				newAssignments.set(name, newTask)
			}
		}
	}

	for (const [name, task] of newAssignments) {
		ns.gang.setMemberTask(name, task)
	}
}

/**
 * Computes the geometric mean of a gang member's combat skills.
 */
function combatSkillAverage(ns: NS, name: string): number {
	const member = ns.gang.getMemberInformation(name)
	const average = Math.pow(member.str * member.def * member.dex * member.agi, .25)
	return average
}