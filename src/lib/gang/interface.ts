import {dodgedProxy} from "/lib/dodge-script";


export const ascendMembers = dodgedProxy<string[], string>("lib/gang/ascend-members.js")

export interface EquipParams {
	budget: number
	members: string[]
}

export const equipMembers = dodgedProxy<EquipParams, string>("lib/gang/equip-members.js")
