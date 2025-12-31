import {
	CityName,
	NS,
} from "@ns"
import Table from "lib/tables"

const BLADEBURNER_FILE = "/state/bladeburner.json"

export async function main(ns: NS) {
	ns.disableLog("ALL")
	const flags = ns.flags([
		["server", false],
	])

	do {
		ns.clearLog()
		const cityData = generateCityData(ns)
		const cityTable = cityDataTable(cityData)
		cityTable.printToTail(ns)

		ns.write(BLADEBURNER_FILE, JSON.stringify(cityData, null, 2) , "w")
		if (!flags["server"]) {
			break;
		}
		await ns.asleep(60000)
	} while (true)
}

function generateCityData(ns: NS): BBCity[] {
	const cities: BBCity[] = []
	for (const city of Object.values(ns.enums.CityName) as CityName[]) {
		const population = ns.bladeburner.getCityEstimatedPopulation(city)
		const communities = ns.bladeburner.getCityCommunities(city)
		const chaos = ns.bladeburner.getCityChaos(city)

		cities.push({ city, population, communities, chaos })
	}
	return cities
}

function cityDataTable(cities: BBCity[]): Table {
	const bbTable = new Table({ defaultWidth: 15 })
	bbTable.addColumn({ headerText: "City", fieldName: "city"})
	bbTable.addColumn({ headerText: "Population", fieldName: "population", fieldType: "number"})
	bbTable.addColumn({ headerText: "Communities", fieldName: "communities" })
	bbTable.addColumn({ headerText: "Chaos", fieldName: "chaos", fieldType: "number" })

	for (const bbCity of cities) {
		bbTable.addRow(bbCity)
	}
	return bbTable
}

interface BBCity {
	city: CityName
	population: number
	communities: number
	chaos: number
}
