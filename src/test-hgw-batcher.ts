import { NS } from "@ns"
import * as cluster from "cluster"
import HGWBatcher from "hgw-batcher"
import Log from "lib/logging"

/** @param {NS} ns */
export async function main(ns: NS) {
	ns.disableLog("ALL")
	const log = new Log(ns).toTerminal().level("FINE")

	const homeCluster = new cluster.ComputeCluster(ns)
	homeCluster.addServer("home")
	const hackCluster = new cluster.HackedCluster(ns)
	const pserverCluster = new cluster.PurchasedCluster(ns)


	const hgwBatcher = new HGWBatcher(ns, ns.args[0].toString(), log)
	hgwBatcher.percent = .03
	hgwBatcher.setServers([
		...pserverCluster.servers,
		...homeCluster.servers,
		...hackCluster.servers,
		])
	await hgwBatcher.runOnServers()

	const script = ns.getRunningScript()
	// This script had better exist
	log.info("Gathered $%s", ns.formatNumber(script!.onlineMoneyMade))

}