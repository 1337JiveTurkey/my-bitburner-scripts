import { NS } from "@ns"

/**
 *
 * Test function for the table class.
 */
export async function main(ns: NS) {
	const t = new Table({ defaultWidth:15 })
	t.addColumn({fieldName: "foo" })
	t.addColumn({fieldName: "bar" })
	t.addColumn({fieldName: "baz" })
	t.addColumn({headerText: "Percentage", fieldName: "percent", fieldType: "percent" })
	t.addRow({
		foo: "1",
		bar: "2",
		baz: "3",
		percent: .25
	})
	t.addRow(["4", "5", "6", .75])
	t.printToTerminal(ns)
}

/**
 * Class for displaying information from various objects or arrays in a
 * tabular fashion.
 */
export default class Table {
	#columns: ColumnData[] = []
	#rows: object[] = []
	#defaultType: fieldType
	#defaultWidth: number

	/**
	 * Constructor naturally takes an NS and an object of initial parameters.
	 */
	constructor({defaultType="text", defaultWidth=25}={}) {
		this.#defaultType = defaultType as fieldType
		this.#defaultWidth = defaultWidth
	}

	/**
	 * Adds a column to the table with the associated metadata.
	 */
	addColumn({headerText="", fieldName="", fieldWidth=this.#defaultWidth, fieldType=this.#defaultType}={}) {
		const columnNumber = this.#columns.length
		if (!headerText) {
			if (fieldName) {
				headerText = fieldName
			} else {
				headerText = "Column " + (columnNumber + 1)
			}
		}
		this.#columns.push({
			headerText,
			fieldName,
			fieldNumber: columnNumber,
			fieldWidth,
			fieldType,
		})

	}

	/**
	 * Adds a row to the table
	 */
	addRow(rowData: object): void {
		this.#rows.push(rowData)
		// for (const index in this.#columns) {
		// 	const column = this.#columns[index]
		// 	const cellData = rowData[column.fieldName]
		// }
	}

	/**
	 * Prints to the tail of the current process, like if print were used.
	 */
	printToTail(ns: NS): void {
		this.#doPrint(ns, ns.printf)
	}

	/**
	 * Prints to the terminal as if tprint were used.
	 */
	printToTerminal(ns: NS): void {
		this.#doPrint(ns, ns.tprintf)
	}

	/**
	 * Does the actual printing of the table.
	 *
	 * @param ns The NS used
	 * @param printff The printf function used to print the table.
	 */
	#doPrint(ns: NS, printff: (format: string, ...values: any[]) => void): void {
		let template = ""
		let parameters: any[] = []
		for (const column of this.#columns) {
			template += "%" + column.fieldWidth + "s"
			parameters.push(column.headerText)
		}
		printff(template, ...parameters)
		// Outer loop goes over each row, inner loop gets the respective field
		for (const row of this.#rows) {
			parameters = []
			const isArray = Array.isArray(row)
			for (const column of this.#columns) {
				// Error translation: We can't be sure there's a field named
				// column.fieldName. We're not doing strongly typed so oh well
				// @ts-ignore
				const fieldValue = isArray? row[column.fieldNumber] : row[column.fieldName]
				switch (column.fieldType) {
					case "text":
						parameters.push(fieldValue)
						break
					case "number":
						parameters.push(ns.formatNumber(fieldValue))
						break
					case "percent":
						parameters.push(ns.formatPercent(fieldValue))
						break
					case "msectime":
						parameters.push(ns.tFormat(fieldValue, true))
						break
					case "sectime":
						parameters.push(ns.tFormat(fieldValue, true))
						break
					case "ram":
						parameters.push(ns.formatRam(fieldValue))
						break
					default:
						// TODO Add better error handling here for invalid field type
						printff("Unknown field type %s", column.fieldType)
						return
				}
			}
			printff(template, ...parameters)
		}
	}
}

/**
 * The information about each column in the table. Used to select data to render
 * and format it properly.
 */
interface ColumnData {
	headerText: string,
	fieldName: string,
	fieldNumber: number,
	fieldWidth: number,
	fieldType: fieldType
}

type fieldType = "text" | "number" | "percent" | "ram" | "msectime" | "sectime"