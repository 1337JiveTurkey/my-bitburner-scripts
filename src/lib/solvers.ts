import { NS } from "@ns"

export async function main(ns: NS) {

}

export function maxiumumSubarray(ns: NS, numbers: number[]): number {
	let bestSum = -Infinity
	let currentSum = 0
	for (const n of numbers) {
		currentSum = Math.max(n, currentSum + n)
		bestSum = Math.max(bestSum, currentSum)
	}
	return bestSum
}

const GPNs: number[] = [1, 2, 5, 7, 12, 15, 22, 26, 35, 40, 51, 57, 70, 77, 92, 100]
const signs: number[] = [+1, +1, -1, -1, +1, +1, -1, -1, +1, +1, -1, -1, +1, +1, -1, -1]

export function partitions(ns: NS, n: number): number {
	const memo: number[] = Array(n + 1)
	memo[0] = 1
	for (let i = 1; i <= n; i++) {
		let sum = 0
		for (let j = 0; j < GPNs.length; j++) {
			const lookback = GPNs[j]
			if (lookback <= i) {
				sum += memo[i - lookback] * signs[j]
			}
			// TODO Should just break if lookback is greater
		}
		memo[i] = sum
	}
	return memo[n]
}

export function spiralize(ns: NS, data: number[][]): number[] {
	const height = data.length
	const width = data[0].length
	const retVal: number[] = []
	let xStart = 0
	let xEnd = width
	let yStart = 0
	let yEnd = height

	return retVal
}

export function squareRoot(ns: NS, s: bigint): bigint {
	const str = s.toString()
	// Get our initial estimate by literally chopping off the bottom half
	let oldE = BigInt(str.substring(0, str.length / 2))
	// Heron's method
	for (let i = 0; i < 100; i++) {
		let newE = (oldE + s / oldE) / 2n
		// if (newE - oldE < 1n && oldE - newE < 1n)
		// 	break
		oldE = newE
	}
	// Now try the closest ones to deal with rounding
	const plusOne = oldE + 1n
	const minusOne = oldE - 1n
	const errorPlusOne = Math.abs(Number(plusOne * plusOne - s))
	const errorMinusOne = Math.abs(Number(minusOne * minusOne - s))
	const errorOldE = Math.abs(Number(oldE * oldE - s))
	const minError = Math.min(errorMinusOne, errorPlusOne, errorOldE)
	if (minError === errorOldE) {
		return oldE
	} else if (minError === errorMinusOne) {
		return minusOne
	} else {
		return plusOne
	}
}

export function uniquePaths(ns: NS, grid: number[][]): number {
	const height = grid.length
	const width = grid[0].length
	let prevRow: number[] = Array(width).fill(0)
	let prevCol = 1
	for (let y = 0; y < height; y++) {
		const row: number[] = Array(width)
		for (let x = 0; x < width; x++) {
			if (grid[y][x]) {
				row[x] = 0
			}
			else {
				row[x] = prevCol + prevRow[x]
			}
			prevCol = row[x]
		}
		prevRow = row
		prevCol = 0
	}
	return prevRow[width - 1]
}