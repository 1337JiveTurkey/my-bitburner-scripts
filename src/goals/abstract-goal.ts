import { NS } from "@ns"

/**
 * A goal is a thing that I want to complete at some point in a Bitburner run,
 * like joining a gang and can be automated.
 */
export default abstract class AbstractGoal {
	readonly ns: NS
	constructor(ns: NS) {
		this.ns = ns
	}

	/**
	 * Whether this goal can be completed at this point.
	 */
	abstract canComplete(): boolean

	/**
	 * Complete this goal.
	 */
	abstract doComplete(): void
}