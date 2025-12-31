import Table from "/lib/tables"

/**
 * Stats relating to a server targeted by a HGW batch.
 */
export interface TargetStats {
	hostname: string
	hackRam: number
	growRam: number
	weakRam: number

	hackTime: number
	growTime: number
	weakTime: number

	hackDelay: number
	growDelay: number
}

export function targetTable(bs: BatchStats): Table {
	const ts: TargetStats = bs.target
	const infoTable = new Table()
	infoTable.addColumn({ headerText: ts.hostname })
	infoTable.addColumn({ headerText: "RAM", fieldType: "ram" })
	infoTable.addColumn({ headerText: "Threads", fieldType: "number" })
	infoTable.addColumn({ headerText: "Time", fieldType: "msectime" })
	infoTable.addRow(["Hack",   ts.hackRam, bs.hackThreads, ts.hackTime])
	infoTable.addRow(["Grow",   ts.growRam, bs.growThreads, ts.growTime])
	infoTable.addRow(["Weaken", ts.weakRam, bs.weakThreads, ts.weakTime])
	return infoTable
}

/**
 * Stats relating to a specific HGW batch.
 */
export interface BatchStats {
	target: TargetStats,
	hackThreads: number,
	growThreads: number,
	weakThreads: number,
	batchRam: number,
	hackMoney: number,
	hackPercent: number,
	hackEfficiency: number
}

export function batchTable(bs: BatchStats[]): Table {
	const estimatesTable = new Table({ defaultWidth: 15 })
	estimatesTable.addColumn({ headerText: "Hack Threads", fieldName: "hackThreads" })
	estimatesTable.addColumn({ headerText: "Grow Threads", fieldName: "growThreads" })
	estimatesTable.addColumn({ headerText: "Weak Threads", fieldName: "weakThreads" })
	estimatesTable.addColumn({ headerText: "Batch RAM", fieldName: "batchRam", fieldType: "ram" })
	estimatesTable.addColumn({ headerText: "Batch Money", fieldName: "hackMoney", fieldType: "number" })
	estimatesTable.addColumn({ headerText: "Percentage", fieldName: "hackPercent", fieldType: "percent" })
	estimatesTable.addColumn({ headerText: "Efficiency", fieldName: "hackEfficiency", fieldType: "number" })

	for (const estimate of bs) {
		estimatesTable.addRow(estimate)
	}
	return estimatesTable
}

export function batchCompare(a: BatchStats, b: BatchStats): number {
	// Try the most efficient first
	const efficiency = b.hackEfficiency - a.hackEfficiency
	if (efficiency !== 0) {
		return efficiency
	} else {
		// If same efficiency then go with the biggest RAM
		return b.batchRam - a.batchRam
	}
}