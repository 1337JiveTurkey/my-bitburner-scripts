/** @param {NS} ns */
export async function main(ns) {
	const pid = ns.pid

	for (let i = 1; i < pid; i++) {
		ns.clearPort(i)
	}
}