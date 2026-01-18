import { NS, ScriptArg } from "@ns"
import {prepareServer} from "/lib/hacking/interface";

/** @param {NS} ns **/
export async function main(ns: NS) {
	const target = ns.args[0].toString()

	const result = await prepareServer(ns, {hostname: target})
	ns.tprintf("%s", result.result)
}

export function autocomplete(data: {
	servers: string[],
	scripts: string[]
	txts: string[],
	flags: (schema: [string, string | number | boolean | string[]][]) => { [key: string]: ScriptArg | string[] }
}, args: string[]) {
	return [...data.servers]
}