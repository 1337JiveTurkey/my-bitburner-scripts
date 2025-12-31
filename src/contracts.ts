import { NS, CodingContractName } from "@ns"
import { getServerState } from "srv/server-state"

import { maxiumumSubarray, partitions, squareRoot, uniquePaths } from "lib/solvers"

/**
 * Finds contracts on machines that haven't been solved yet and
 * runs solvers for the ones I've figured out so far.
 */
export async function main(ns: NS) {
	const flags = ns.flags([
		["list", false],
		["solve", false],
		["test", false]
	])

	const servers = getServerState(ns).filter(s => !s.purchasedByPlayer).map(s => s.hostname)
	// Include home since we put test cases on there
	servers.push("home")
	if (flags["test"]) {
		for (let i = 0; i < 10; i++) {
			const name = ns.enums.CodingContractName.TotalWaysToSum
			const filename = ns.codingcontract.createDummyContract(name)
//			ns.mv("home", filename, "contracts/" + filename)
		}
	}
	for (const hostname of servers) {
		for (const filename of ns.ls(hostname, ".cct")) {
			const contract = ns.codingcontract.getContract(filename, hostname)
			if (flags["list"]) {
				ns.tprintf("%-30s  %-30s", hostname, contract.type)
			} else {
				const solver = solvers[contract.type]
				if (solver) {
					const solution = solver(ns, contract.data)
					ns.tprintf("%-30s  %-50s  %-30s", hostname, contract.type, solution)
					const result = contract.submit(solution)
					if (result) {
						ns.tprintf("\t%s", result)
					} else {
						
					}
				}
			}
		}
	}
}

// @ts-ignore
const solvers: {[name in CodingContractName]:  (ns: NS, data: any) => any } = {
	"Algorithmic Stock Trader I": function(ns: NS, data: number[]): number {
		const deltas = []
		for (let i = 0; i < data.length - 1; i++) {
			deltas[i] = data[i + 1] - data[i]
		}
		return maxiumumSubarray(ns, deltas)
	},
	// "Spiralize Matrix": function(ns: NS, data: number[][]): number[] {
	// 	return spiralize(ns, data)
	// },
	"Square Root": function(ns: NS, data: bigint): bigint {
		return squareRoot(ns, data)
	},
	"Subarray with Maximum Sum": function(ns: NS, data: number[]): number {
		return maxiumumSubarray(ns, data)
	},
	"Total Ways to Sum": function(ns: NS, data: number) {
		const dynamic = (partitions(ns, data) - 1)
		return dynamic
	},
	"Unique Paths in a Grid I": function(ns: NS, [width, height]: [number, number]): number {
		return uniquePaths(ns, Array(height).fill(Array(width).fill(0)))
	},
	"Unique Paths in a Grid II": function(ns: NS, data: number[][]): number {
		return uniquePaths(ns, data)
	}
}

