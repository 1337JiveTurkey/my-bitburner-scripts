import { NS, AutocompleteData } from "@ns"
import {prepareServer} from "/lib/hacking/interface";

/** @param {NS} ns **/
export async function main(ns: NS) {
	const target = ns.args[0].toString()

	const {result} = await prepareServer(ns, {hostname: target})
	ns.tprintf("%s", result)
}

export function autocomplete(data: AutocompleteData) {
	return [...data.servers]
}