import {GangMemberInfo, NS} from "@ns"
import dodgedMain from "lib/dodge-script"

export const main = dodgedMain<string[], string>(async (ns: NS, params: string[]) => {
	const members = params.map(arg => ns.gang.getMemberInformation(arg))

	for (const member of members) {
		doAscendMember(ns, member)
	}
	return "Ascended Members"
})

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