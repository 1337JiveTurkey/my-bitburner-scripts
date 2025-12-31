import { NS } from "@ns"

export async function main(ns: NS) {
	ns.run("crimes.js", {}, "--commit")
	ns.run("service.js", {}, "server-state.js")
	ns.run("service.js", {}, "budget-state.js")


}