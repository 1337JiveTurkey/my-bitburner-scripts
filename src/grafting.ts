import { NS } from "@ns"
import { getAugFlags } from "lib/augmentation"

export async function main(ns: NS) {

	const g = ns.grafting
	const s = ns.singularity

	const augs = g.getGraftableAugmentations()
	const ownedAugs = new Set(s.getOwnedAugmentations(true))
	const augObjects = []

	for (const aug of augs) {
		if (ownedAugs.has(aug)) {
			continue
		}
		const stats = s.getAugmentationStats(aug)
		augObjects.push({
			name: aug,
			time: g.getAugmentationGraftTime(aug),
			price: g.getAugmentationGraftPrice(aug),
			flags: getAugFlags(stats),
		})
	}
	augObjects.sort((a, b) => a.time - b.time)

	// Don't stop grafting if we already are
	const task = s.getCurrentWork()
	if (task && task.type === "GRAFTING") {
		await g.waitForOngoingGrafting()
	}

	for (const aug of augObjects) {
		if (ns.getPlayer().city !== "New Tokyo") {
			s.travelToCity("New Tokyo")
		}
		if (aug.flags.includes("hacking")) {
			ns.tprintf("%60s%45s%15s", aug.name, ns.tFormat(aug.time), ns.formatNumber(aug.price))
			g.graftAugmentation(aug.name, false)
			await g.waitForOngoingGrafting()
		}
	}
}