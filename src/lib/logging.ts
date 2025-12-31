import { NS } from "@ns"

/**
 * Object for configurable logging of scripts. If no configuration
 * is done on the logger, it acts as a null logger and doesn't
 * print anything.
 */
export default class Log {
	readonly #ns: NS

	#logTo: ((format: string, ...args: any[]) => void) | null = null

	#level: Level = Level.NONE

	constructor(ns: NS) {
		this.#ns = ns
	}

	toTerminal(): Log {
		this.#logTo = this.#ns.tprintf
		return this
	}

	toTail(): Log {
		this.#logTo = this.#ns.printf
		return this
	}

	toFile(fileName: string, append: boolean = true): Log {
		const ns = this.#ns
		if (!append) {
			ns.clear(fileName)
		}
		this.#logTo = (format: string, ...args: any[]) => {
			const message = ns.sprintf(format, ...args)
			ns.write(fileName, message, "a")
		}
		return this
	}

	level(setTo: keyof typeof Level): Log {
		this.#level = Level[setTo]
		return this
	}

	/**
	 * Experimental support for some sort of logging to a port.
	 */
	toPort(portNumber: number): Log {
		const ns = this.#ns
		this.#logTo = (format: string, ...args: any[]) => {
			const message = ns.sprintf(format, ...args)
			ns.writePort(portNumber, message)
		}
		return this
	}

	#printf(level: Level, format: string, ...args: any[]) {
		if (this.#level < level) {
			return
		}
		if (this.#logTo) {
			this.#logTo(format, ...args)
		}
	}

	error(format: string, ...args: any[]) {
		this.#printf(Level.ERROR, "[ERROR] " + format, ...args)
	}

	warn(format: string, ...args: any[]) {
		this.#printf(Level.WARN,  "[WARN]  " + format, ...args)
	}

	info(format: string, ...args: any[]) {
		this.#printf(Level.INFO,  "[INFO]  " + format, ...args)
	}

	fine(format: string, ...args: any[]) {
		this.#printf(Level.FINE,  "[FINE]  " + format, ...args)
	}

	finer(format: string, ...args: any[]) {
		this.#printf(Level.FINER, "[FINER] " + format, ...args)
	}

}

export enum Level {
	NONE,
	ERROR,
	WARN,
	INFO,
	FINE,
	FINER,
}