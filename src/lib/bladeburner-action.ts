import {
	Bladeburner,
	BladeburnerActionName,
	BladeburnerActionType,
	BladeburnerBlackOpName,
	NS,
} from "@ns"

/**
 * A not-particularly RAM-efficient way to treat Bladeburner actions as objects.
 */
export default class BladeburnerAction {
	readonly #ns: NS
	readonly #bb: Bladeburner
	readonly actionType: BladeburnerActionType
	readonly actionName: BladeburnerActionName

	constructor(ns: NS, actionType: BladeburnerActionType, actionName: BladeburnerActionName) {
		this.#ns = ns
		this.#bb = ns.bladeburner
		this.actionType = actionType
		this.actionName = actionName
	}

	start(): boolean {
		return this.#bb.startAction(this.actionType, this.actionName)
	}

	// get autolevel(): boolean {
	// 	return this.#bb.getActionAutolevel(this.actionType, this.actionName)
	// }
	//
	// set autolevel(b: boolean) {
	// 	this.#bb.setActionAutolevel(this.actionType, this.actionName, b)
	// }

	get chances(): [number, number] {
		return this.#bb.getActionEstimatedSuccessChance(this.actionType, this.actionName)
	}

	get countRemaining(): number {
		return this.#bb.getActionCountRemaining(this.actionType, this.actionName)
	}

	get rankRequired(): number {
		if (this.isBlackOps) {
			return this.#bb.getBlackOpRank(this.actionName as BladeburnerBlackOpName)
		} else {
			return 0
		}
	}

	get rankRequirementMet(): boolean {
		return this.rankRequired <= this.#bb.getRank()
	}

	get running(): boolean {
		const currentAction = this.#bb.getCurrentAction()
		return currentAction !== null &&
			currentAction.type === this.actionType &&
			currentAction.name === this.actionName
	}

	get successes(): number {
		return this.#bb.getActionSuccesses(this.actionType, this.actionName)
	}

	get time(): number {
		return this.#bb.getActionTime(this.actionType, this.actionName)
	}

	get isGeneral(): boolean {
		return this.actionType === "General"
	}

	get isContract(): boolean {
		return this.actionType === "Contracts"
	}

	get isOperation(): boolean {
		return this.actionType === "Operations"
	}

	get isBlackOps(): boolean {
		return this.actionType === "Black Operations"
	}

	equals(o: BladeburnerAction): boolean {
		return o !== null && o.actionType === this.actionType && o.actionName === this.actionName
	}

	static current(ns: NS): BladeburnerAction|null {
		const currentAction = ns.bladeburner.getCurrentAction()
		if (!currentAction) {
			return null
		}
		return new BladeburnerAction(ns,
			currentAction.type as BladeburnerActionType,
			currentAction.name as BladeburnerActionName,)
	}

	static nextBlackOp(ns: NS): BladeburnerAction|null {
		const nextAction = ns.bladeburner.getNextBlackOp()
		if (!nextAction) {
			return null
		}
		return new BladeburnerAction(ns,
			"Black Operations" as BladeburnerActionType,
			nextAction.name as BladeburnerActionName,)
	}

	static training(ns: NS): BladeburnerAction {
		return new BladeburnerAction(ns,
			"General" as BladeburnerActionType,
			"Training" as BladeburnerActionName)
	}

	static analysis(ns: NS): BladeburnerAction {
		return new BladeburnerAction(ns,
			"General" as BladeburnerActionType,
			"Field Analysis" as BladeburnerActionName)
	}

	static diplomacy(ns: NS): BladeburnerAction {
		return new BladeburnerAction(ns,
			"General" as BladeburnerActionType,
			"Diplomacy" as BladeburnerActionName)
	}

	static regeneration(ns: NS): BladeburnerAction {
		return new BladeburnerAction(ns,
			"General" as BladeburnerActionType,
			"Hyperbolic Regeneration Chamber" as BladeburnerActionName)
	}

	static tracking(ns: NS): BladeburnerAction {
		return new BladeburnerAction(ns,
			"Contracts" as BladeburnerActionType,
			"Tracking" as BladeburnerActionName)
	}

	static investigation(ns: NS): BladeburnerAction {
		return new BladeburnerAction(ns,
			"Operations" as BladeburnerActionType,
			"Investigation" as BladeburnerActionName)
	}

	static undercoverOp(ns: NS): BladeburnerAction {
		return new BladeburnerAction(ns,
			"Operations" as BladeburnerActionType,
			"Undercover Operation" as BladeburnerActionName)
	}

	static assassination(ns: NS): BladeburnerAction {
		return new BladeburnerAction(ns,
			"Operations" as BladeburnerActionType,
			"Assassination" as BladeburnerActionName)
	}
}