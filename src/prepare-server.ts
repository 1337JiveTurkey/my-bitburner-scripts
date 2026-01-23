import { NS, AutocompleteData } from "@ns"
import { HackingInterface } from "lib/hacking/interface"
import Log from "lib/logging"

export async function main(ns: NS): Promise<void> {
	ns.disableLog("ALL")

	const target = ns.args[0]?.toString()
	if (!target) {
		ns.tprintf("ERROR: Usage: run prepare-server.ts <hostname>")
		return
	}

	const log = new Log(ns).level("INFO").toTerminal()
	const hacking = new HackingInterface(ns, log)

	const { result } = await hacking.prepareServer({ hostname: target })
	ns.tprintf("%s", result)
}

export function autocomplete(data: AutocompleteData) {
	return [...data.servers]
}