import { NS, Server } from "@ns"
import { ThreadEstimate } from "hgw-batcher"
import HGWBatcher from "hgw-batcher"
import { getServerState, ServerState } from "srv/server-state"
import Table from "lib/tables"

const TARGETS_FILE = "state/targets.json"

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const flags = ns.flags([
		["server", false],
	])
	do {
		ns.clearLog()
		const jsonTargets: TargetState[] = []
		// Look at servers with an actual moneyMax set
		const servers = getServerState(ns).filter(s => s.moneyMax)
		for (const server of servers) {
			const batcher = new HGWBatcher(ns, server.hostname)
			batcher.calculateEstimates()
			const targetObject = ns.getServer(server.hostname)
			const targetState = server as TargetState
			targetState.moneyPrep = moneyPrep(targetObject)
			targetState.securityPrep = securityPrep(targetObject)
			targetState.estimate = batcher.threadEstimates[0]
			if (targetState.estimate.hackEfficiency > 0) {
				jsonTargets.push(targetState)
			}
		}

		ns.write(TARGETS_FILE, JSON.stringify(jsonTargets, null, 2) , "w")
		printTargetTables(ns, jsonTargets)
		if (!flags["server"]) {
			break;
		}
		await ns.asleep(60000)
	} while(true)
}

function moneyPrep(target: Server): number {
	if (!target.moneyMax || !target.moneyAvailable) {
		return -1
	}
	const moneyDeficit = target.moneyMax - target.moneyAvailable
	return 1 - moneyDeficit / target.moneyMax
}

function securityPrep(target: Server): number {
	if (!target.hackDifficulty || !target.minDifficulty) {
		return -1
	}
	const excessDifficulty = target.hackDifficulty - target.minDifficulty
	const difficultyRange = 100 - target.minDifficulty
	return 1 - excessDifficulty / difficultyRange
}

function printTargetTables(ns: NS, targets: TargetState[]) {
	const targetTable = new Table({ defaultWidth: 15 })
	targetTable.addColumn({ headerText: "Hostname",       fieldType: "text", fieldWidth: 24 })
	targetTable.addColumn({ headerText: "Money %",        fieldType: "percent", fieldWidth: 12 })
	targetTable.addColumn({ headerText: "Security %",     fieldType: "percent", fieldWidth: 12 })
	targetTable.addColumn({ headerText: "Maximum Money",  fieldType: "number" })
	targetTable.addColumn({ headerText: "Skill",          fieldType: "text", fieldWidth: 6 })
	targetTable.addColumn({ headerText: "Efficiency",     fieldType: "number" })
	targetTable.addColumn({ headerText: "Batch RAM",      fieldType: "ram" })
	targetTable.addColumn({ headerText: "Hack Percent",   fieldType: "percent" })


	for (const target of targets) {
		targetTable.addRow([target.hostname,
		                    target.moneyPrep,
		                    target.securityPrep,
		                    target.moneyMax,
		                    target.requiredHackingSkill,
		                    target.estimate.hackEfficiency,
		                    target.estimate.batchRam,
		                    target.estimate.hackPercent])
	}
	targetTable.printToTail(ns)
}

/** @param {NS} ns */
export function getTargetState(ns: NS): TargetState[] {
	const state = ns.read(TARGETS_FILE)
	if (state === "") {
		return []
	} else {
		return JSON.parse(state)
	}
}

interface TargetState extends ServerState {
	estimate: ThreadEstimate,
	moneyPrep: number,
	securityPrep: number,
}