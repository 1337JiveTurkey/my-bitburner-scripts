import {NS} from "@ns"
import dodgedProxy from "/lib/dodge-proxy";

export interface BuyServersParams {
	budget: number
}

export interface BuyServersResults {
	purchasedServers: string[]
	canBuyMore: boolean
}

export const buyServers: (ns: NS, params: BuyServersParams) => Promise<BuyServersResults> = dodgedProxy<BuyServersParams, BuyServersResults>("lib/servers/buy-servers.js")

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

export const getServers: (ns: NS, params: GetServersParams) => Promise<GetServersResults> = dodgedProxy<GetServersParams, GetServersResults>("lib/servers/get-servers.js")


export interface OpenPortsParams {
	budget: number
}

export interface OpenPortsResults {
	openedServers: string[]
	canOpenMore: boolean
}

export const openPorts: (ns: NS, params: OpenPortsParams) => Promise<OpenPortsResults> = dodgedProxy<OpenPortsParams, OpenPortsResults>("lib/servers/open-ports.js")