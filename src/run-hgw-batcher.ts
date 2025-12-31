import { NS } from "@ns"
import * as cluster from "cluster"
import HGWBatcher from "hgw-batcher"

/** @param {NS} ns */
export async function main(ns: NS) {
	ns.disableLog("ALL")

	const homeCluster = new cluster.ComputeCluster(ns)
	homeCluster.addServer("home")
	const hackCluster = new cluster.HackedCluster(ns)
	const pserverCluster = new cluster.PurchasedCluster(ns)



	let i = 0
	while (true) {
		const hgwBatcher = new HGWBatcher(ns, ns.args[0].toString())
		hgwBatcher.percent = .06
		hgwBatcher.setServers([
			...pserverCluster.servers,
			...homeCluster.servers,
			...hackCluster.servers,
			])
		await hgwBatcher.runOnServers()
		if (i++ % 10 == 0) {
			pserverCluster.upgradeServers(Math.min(ns.getPlayer().money, 1_000_000_000_000))
			hackCluster.updateServers()
			hgwBatcher.printServersInfo()
		}
	}

}