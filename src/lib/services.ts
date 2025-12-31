import { NS } from "@ns"

const SERVICES_FILE = "/state/services.json"
/**
 * Library that handles the communication between services directly
 * within the service script itself. In other words there's no
 * srv/service-state.ts script that handles scripts calling services
 * and instead each service imports this and calls the various
 * functions directly.
 */

/**
 * Service directly calls this now since services need to clean up after
 * they run.
 */
export function registerServicePort(ns: NS): number {
	const self = ns.self()
	const pid = self.pid
	if (!self.filename.startsWith("srv/")) {
		ns.tprintf("WARNING: %s isn't in the srv/ directory. Didn't register.", self.filename)
		return pid
	}
	const service = self.filename.substring(4)
	const oldState = getServicesState(ns)
	oldState[service] = pid
	ns.write(SERVICES_FILE, JSON.stringify(oldState, null, 2) , "w")
	ns.atExit(() => {
		const oldState = getServicesState(ns)
		if (oldState[service] !== pid) {
			ns.tprintf("WARNING: PID %i was not set in %s. Something's not right.", pid, SERVICES_FILE)
		}
		delete oldState[service]
		ns.write(SERVICES_FILE, JSON.stringify(oldState, null, 2) , "w")
	}, "Clean up " + pid)
	return pid
}

export function listenOnServicePort(ns: NS) {
	const self = ns.self()
	const pid = self.pid

}

/**
 * Gets the ServiceState from the SERVICES_FILE or returns an empty
 * object if there's nothing written there yet.
 */
export function getServicesState(ns: NS): ServiceState {
	const state = ns.read(SERVICES_FILE)
	if (state === "") {
		return {}
	} else {
		return JSON.parse(state)
	}
}

export function getServiceID(ns: NS, service: string): number {
	return getServicesState(ns)[service]
}

/**
 * The ServiceState object is really just a map of service names
 * to the associated PID which is the port that it listens on.
 */
interface ServiceState {
	[key: string]: number
}


export function connectToService(ns: NS, service: string): ServiceHandle {
	const responsePID = ns.self().pid
	const servicePID = getServiceID(ns, service)
	return {

	}
}

export interface ServiceHandle {

}