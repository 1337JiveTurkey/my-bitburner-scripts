import DodgeInterface from "/lib/dodge-interface";

export interface BuyServersParams {
	budget: number
}

export interface BuyServersResults {
	purchasedServers: string[]
	canBuyMore: boolean
}

export interface ServerStats {
	hostname: string
	parent?: string
	children: string[]
	hasAdminRights: boolean
	hasBackdoor: boolean
	maxRam: number
	minDifficulty: number
	moneyMax: number
	purchasedByPlayer: boolean
	isHome: boolean
	isPserv: boolean
	isHacknet: boolean
	isHacked: boolean
	requiredHackingSkill: number
}

export interface GetServersParams {}

export interface GetServersResults {[hostname: string]: ServerStats}

export interface OpenPortsParams {
	budget: number
}

export interface OpenPortsResults {
	openedServers: string[]
	canOpenMore: boolean
}

/**
 * Dodged interface for the server-management scripts. Like HackingInterface and
 * GangInterface it takes a Log so a child's logs stream back to the caller.
 * This replaces the old standalone dodgedProxy() functions.
 */
export class ServersInterface extends DodgeInterface {
	async buyServers(params: BuyServersParams): Promise<BuyServersResults> {
		return await this.dodgeCall(params, "lib/servers/buy-servers.js")
	}

	async getServers(params: GetServersParams = {}): Promise<GetServersResults> {
		return await this.dodgeCall(params, "lib/servers/get-servers.js")
	}

	async openPorts(params: OpenPortsParams): Promise<OpenPortsResults> {
		return await this.dodgeCall(params, "lib/servers/open-ports.js")
	}
}
