import { NS } from "@ns"
import {ComputeCluster, HackedCluster, PurchasedCluster} from "cluster"

export async function main(ns: NS) {
	const homeCluster = new ComputeCluster(ns)
	homeCluster.addServer("home")
	const hackCluster = new HackedCluster(ns)
	const pserverCluster = new PurchasedCluster(ns)

	hackCluster.updateServers()

	while (true) {
		const promises = []
		promises.push(runGrows(homeCluster))
		promises.push(runGrows(hackCluster))
		promises.push(runGrows(pserverCluster))

		await Promise.all(promises)
	}
}

async function runGrows(cl: ComputeCluster) {
	const growsPossible = cl.growsPossible
	return await cl.clusterGrow("joesguns", growsPossible, 0)
}