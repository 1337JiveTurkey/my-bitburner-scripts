import dodgedProxy from "/lib/dodge-proxy";

export interface BuyServersParams {
	budget: number
}

export interface BuyServersResults {
	purchasedServers: string[]
	canBuyMore: boolean
}

export const buyServers = dodgedProxy<BuyServersParams, BuyServersResults>("lib/servers/buy-servers.js")

export interface OpenPortsParams {
	budget: number
}

export interface OpenPortsResults {
	openedServers: string[]
	canOpenMore: boolean
}

export const openPorts = dodgedProxy<OpenPortsParams, OpenPortsResults>("lib/servers/open-ports.js")