import { NS } from "@ns"

export async function main(ns: NS) {
	const url = String(ns.args[0] ?? "");
	if (!url) {
		ns.tprint("Usage: run discord-webhook.js <WEBHOOK_URL>");
		return;
	}
	localStorage.setItem("discordURL", url)
}

export class DiscordWebhook {
	readonly #url: URL
	username: string = "Bitburner Notifier"
	constructor() {
		const storedURL = localStorage.getItem("discordURL")
		if (storedURL) {
			this.#url = new URL(storedURL)
		} else {
			throw new Error("Discord Webhook URL doesn't exist. Call discord-webhook.js with the URL to store it.");
		}
	}

	async post(message: string): Promise<string> {
		if (!message) {
			throw new Error("Need a message to send to Discord");
		}
		if (!this.username) {
			throw new Error("Need a username to send to Discord");
		}
		const payload = {
			content: message,
			username: this.username,
			allowed_mentions: { parse: [] },
		}

		const r = await fetch(this.#url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})
		return r.statusText
	}
}