import {GangMemberInfo, NS} from "@ns"
import {dodgedMain, dodgedProxy} from "lib/dodge-script"

interface Params {
	members: string[]
}

interface Return {
	result: string
}

export const main = dodgedMain<Params, Return>(async (ns: NS, params: Params) => {
	const members = params.members.map(arg => ns.gang.getMemberInformation(arg))

	for (const member of members) {
		doAscendMember(ns, member)
	}
	return {} as Return
})

export const ascendMembers = dodgedProxy<Params, Return>("lib/gang/ascendMembers.js")

function doAscendMember(ns: NS, member: GangMemberInfo) {
	if (!member.task.includes("Train")) {
		return
	}
	const result = ns.gang.getAscensionResult(member.name)
	if (typeof result === "undefined") {
		return
	}
	const increase = result.hack * result.str * result.def * result.dex * result.agi * result.cha
	ns.print(member.name + " (" + member.task + "): " + increase)
	if (increase > 4) {
		ns.print("Ascending " + member.name)
		ns.gang.ascendMember(member.name)
	}
}