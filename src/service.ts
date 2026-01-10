import { NS, ScriptArg } from "@ns"

/**
 * Script for starting and ending various services. Right now just
 * stops a service if it's already running and restarts it with the
 * new set of parameters. When it starts the new version of the service
 * it also registers the service name with the service's associated port.
 */
export async function main(ns: NS) {
	const args = ns.args
	if (!ns.args[0]) {
		ns.tprintf("ERROR: Must run %s with a service to start or restart", ns.getScriptName())
		return
	}
	const service = "srv/" + ns.args[0].toString()
	let oldPid = 0
	for (const process of ns.ps()) {
		if (process.filename === service) {
			ns.kill(process.pid)
			oldPid = process.pid
		}
	}
	const newArgs = ["--server", ...args.slice(1)]
	ns.spawn(service, {spawnDelay: 10}, ...newArgs)
}

function loadConfig(ns: NS) {

}

interface ServiceConfig {
	
}


export function autocomplete(data: {
	servers: string[],
	scripts: string[]
	txts: string[],
	flags: (schema: [string, string | number | boolean | string[]][]) => { [key: string]: ScriptArg | string[] }
}, args: string[]) {
	// Strip off the srv/ from the service scripts and include only those
	const services = data.scripts.
		filter(script => script.startsWith("srv/")).
		map(script => script.substring(4))
	return [...services]
}