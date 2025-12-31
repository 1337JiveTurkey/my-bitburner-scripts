import { NS } from "@ns"
import { getGangState } from "/srv/gang-state";

export async function main(ns: NS) {
	const gangState = getGangState(ns)
	if (!gangState) {

	}

	const newAssignments = new Map<string, string>()
	for (const name of ns.gang.getMemberNames()) {
		const task = ns.gang.getMemberInformation(name).task
		if (task === "Train Combat") {
			newAssignments.set(name, "Human Trafficking")
		}
		if (task === "Human Trafficking") {
			newAssignments.set(name, "Territory Warfare")
		}
		if (task === "Territory Warfare") {
			newAssignments.set(name, "Train Combat")
		}

	}

	for (const [name, task] of newAssignments.entries()) {
		ns.gang.setMemberTask(name, task)
	}
}