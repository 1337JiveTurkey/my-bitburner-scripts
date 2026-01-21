import DodgeInterface from "/lib/dodge-interface";

export interface EquipParams {
	budget: number
	members: string[]
}

export class GangInterface extends DodgeInterface {
	async ascendMembers(members: string[]): Promise<string> {
		return await this.dodgeCall<string[], string>(members, "lib/gang/ascend-members.js")
	}

	async equipMembers(params: EquipParams): Promise<string> {
		return await this.dodgeCall<EquipParams, string>(params, "lib/gang/equip-members.js")
	}
}
