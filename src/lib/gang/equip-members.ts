import {GangMemberInfo, NS} from "@ns"
import dodgedMain from "lib/dodge-script"
import {EquipParams} from "lib/gang/interface"

export const main = dodgedMain<EquipParams, string>(async (ns: NS, params: EquipParams) => {
	const members = params.members.map(arg => ns.gang.getMemberInformation(arg))

	const equipInfos = getAllEquipInfo(ns)

	for (const member of members) {
		doEquipMember(ns, member, equipInfos, params.budget)
	}
	return "Equipped Members"
})

function doEquipMember(ns: NS, member: GangMemberInfo, gangEquip: EquipInfo[], budget: number) {
	let remainingBudget = budget
	if (member.task.includes("Train")) {
		return
	}
	const extant = new Set([...member.augmentations, ...member.upgrades])
	for (const e of gangEquip) {
		if (!extant.has(e.name)) {
			if (e.cost < remainingBudget) {
				remainingBudget -= e.cost
				ns.gang.purchaseEquipment(member.name, e.name)
			}
		}
	}
}

interface EquipInfo { name: string, cost: number, eType: string }

function getAllEquipInfo(ns: NS): EquipInfo[] {
	const gangEquip = ns.gang.getEquipmentNames()
	const res = []
	for (const e of gangEquip) {
		const cost = ns.gang.getEquipmentCost(e)
		const eType = ns.gang.getEquipmentType(e)
		res.push({
			name: e,
			cost: cost,
			eType: eType,
		})
	}
	// Sort ascending by price for when we account for budgets
	res.sort((a, b) => {
		return a.cost - b.cost
	})
	//	ns.tprint(JSON.stringify(res, null, 2))
	return res
}