import { NS, AutocompleteData } from "@ns"
import {HackingInterface} from "/lib/hacking/interface";
import Log from "/lib/logging";

/** @param {NS} ns **/
export async function main(ns: NS) {
	ns.disableLog("ALL")
	const log = new Log(ns).level("INFO").toTerminal()
	const hacking = new HackingInterface(ns, log)

	const target = ns.args[0].toString()

	const {result} = await hacking.prepareServer({hostname: target})
	ns.tprintf("%s", result)
}

export function autocomplete(data: AutocompleteData) {
	return [...data.servers]
}