import {GangMemberInfo, NS} from "@ns"
import {dodgedMain, dodgedProxy} from "lib/dodge-script"

interface Params {
	budget: number
	members: string[]
}

interface Return {
	result: string
}

export const main = dodgedMain<Params, Return>(async (ns: NS, params: Params) => {
	const members = params.members.map(arg => ns.gang.getMemberInformation(arg))

	const equipInfos = getAllEquipInfo(ns)

	for (const member of members) {
		doEquipMember(ns, member, equipInfos, params.budget)
	}
	return { result: "Success" } as Return
})

export const equipMembers = dodgedProxy<Params, Return>("lib/gang/equip-members.js")

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