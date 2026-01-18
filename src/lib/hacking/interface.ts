import {NS} from "@ns"
import dodgedProxy from "/lib/dodge-proxy";

export interface PrepareServerParams {
	hostname: string
}

export interface PrepareServerResults {
	result: string
}

export const prepareServer: (ns: NS, params: PrepareServerParams) => Promise<PrepareServerResults> =
	dodgedProxy<PrepareServerParams, PrepareServerResults>("lib/hacking/prepare-server.js")