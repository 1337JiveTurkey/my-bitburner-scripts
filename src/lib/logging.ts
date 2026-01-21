import { NS } from "@ns"

/**
 * Object for configurable logging of scripts. If no configuration is done on
 * the logger, it acts as a null logger and doesn't print anything.
 * Also integrates with the dodging to allow logging across run() calls.
 */
export default class Log {
	readonly #ns: NS

	#logHandler: ((level: Level, format: string, args: any[]) => void) | null = null

	#level: Level = Level.NONE

	constructor(ns: NS) {
		this.#ns = ns
	}

	level(setTo: keyof typeof Level): Log {
		this.#level = Level[setTo]
		return this
	}

	toTerminal(): Log {
		this.#logHandler = (level: Level, format: string, args: any[]) => {
			this.#ns.tprintf(this.#prefix(level) + format, ...args)
		}
		return this
	}

	toTail(): Log {
		this.#logHandler = (level: Level, format: string, args: any[]) => {
			this.#ns.printf(this.#prefix(level) + format, ...args)
		}
		return this
	}

	toFile(fileName: string, append: boolean = true): Log {
		const ns = this.#ns
		if (!append) {
			ns.clear(fileName)
		}
		this.#logHandler = (level: Level, format: string, args: any[]) => {
			const message = ns.sprintf(this.#prefix(level) + format, ...args)
			ns.write(fileName, message, "a")
		}
		return this
	}

	/**
	 * Experimental support for some sort of logging to a port.
	 */
	toPort(portNumber: number): Log {
		const ns = this.#ns
		this.#logHandler = (level: Level, format: string, args: any[]) => {
			ns.writePort(portNumber, {
				tag: "log",
				level,
				format,
				args,
			})
		}
		return this
	}

	logInternal(level: Level, format: string, args: any[]) {
		if (this.#level < level) {
			return
		}
		if (this.#logHandler) {
			this.#logHandler(level, format, args)
		}
	}

	#prefix(level: Level): string {
		switch (level) {
			case Level.NONE:  return "[NONE]  "
			case Level.ERROR: return "[ERROR] "
			case Level.WARN:  return "[WARN]  "
			case Level.INFO:  return "[INFO]  "
			case Level.FINE:  return "[FINE]  "
			case Level.FINER: return "[FINER] "
		}
	}

	error(format: string, ...args: any[]) {
		this.logInternal(Level.ERROR, format, args)
	}

	warn(format: string, ...args: any[]) {
		this.logInternal(Level.WARN,  format, args)
	}

	info(format: string, ...args: any[]) {
		this.logInternal(Level.INFO,  format, args)
	}

	fine(format: string, ...args: any[]) {
		this.logInternal(Level.FINE,  format, args)
	}

	finer(format: string, ...args: any[]) {
		this.logInternal(Level.FINER, format, args)
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