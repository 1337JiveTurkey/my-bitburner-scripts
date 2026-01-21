import DodgeInterface from "/lib/dodge-interface";

export interface PrepareServerParams {
	hostname: string
}

export interface PrepareServerResults {
	result: string
}

export class HackingInterface extends DodgeInterface {
	async prepareServer(params: PrepareServerParams): Promise<PrepareServerResults> {
		return await this.dodgeCall(params, "lib/hacking/prepare-server.js")
	}
}