import { NS, Division, CityName } from "@ns"

export async function main(ns: NS) {
	const nsc = ns.corporation
	if (!nsc.hasCorporation()) {
		ns.tprintf("No corporation to operate!")
	}
	
	ns.tprintf("Cost for offices: $%s", ns.formatNumber(expandOfficeCost(ns, "TobacCorp", 120)))
//	expandOffice(ns, "TobacCorp", 120)

//	fillOffices(ns, "TobacCorp")
}

	// const consts = nsc.getConstants()
	// for (const materialName of consts.materialNames) {
	// 	const md = nsc.getMaterialData(materialName)
	// 	ns.tprintf("Material Name %s %d", materialName, md.baseCost)
	// }

function teatime(ns: NS) {
	const nsc = ns.corporation
	const corp = nsc.getCorporation()
	for (const divName of corp.divisions) {
		const div = nsc.getDivision(divName)
		for (const cityName of div.cities) {
			const office = nsc.getOffice(divName, cityName)
			if (office.avgEnergy < 100) {
				nsc.buyTea(divName, cityName)
				ns.tprintf("Buying tea for %s %s office", divName, cityName)
			}
		}
	}
}

function getAgDivisions(ns: NS): Division[] {
	const nsc = ns.corporation
	const foundDivisions: Division[] = []
	const corp = nsc.getCorporation()
	for (const divName of corp.divisions) {
		const div = nsc.getDivision(divName)
		if (div.type === "Agriculture") {
			foundDivisions.push(div)
		}
	}
	return foundDivisions
}

function getDivisionWarehouses(ns: NS, divName: string): string[] {
	const nsc = ns.corporation
	const foundWarehouses: string[] = []
	const div = nsc.getDivision(divName)

	return foundWarehouses
}

function expandOfficeCost(ns: NS, divName: string, toSize: number): number {
	const nsc = ns.corporation
	const div = nsc.getDivision(divName)
	let cost = 0
	for (const city of div.cities) {
		const office = nsc.getOffice(divName, city)
		cost += nsc.getOfficeSizeUpgradeCost(divName, city, toSize - office.size)
	}
	return cost
}
function expandOffice(ns: NS, divName: string, toSize: number): number {
	const nsc = ns.corporation
	const div = nsc.getDivision(divName)
	let cost = 0
	for (const city of div.cities) {
		const office = nsc.getOffice(divName, city)
		if (toSize - office.size > 0) {
			nsc.upgradeOfficeSize(divName, city, toSize - office.size)
		}
	}
	return cost
}

function fillOffices(ns: NS, divName: string) {
	const nsc = ns.corporation
	const div = nsc.getDivision(divName)
	for (const city of div.cities) {
		const office = nsc.getOffice(divName, city)
		if (office.numEmployees === 0) {
			ns.tprintf("%s office in %s has no employees so can't be filled existing pattern", divName, city)
			continue
		}
		const canHire = office.size - office.numEmployees
		const pattern = extractJobsPattern(ns, divName, city)
		const patternTotal = pattern.bus + pattern.eng + pattern.int + pattern.mgt + pattern.ops + pattern.rnd
		if (canHire % patternTotal !== 0) {
			ns.tprintf("%s office in %s has existing pattern not compatible with number of hirees", divName, city)
			continue
		}
		const multiplier = canHire / patternTotal
		assignNewEmployees(ns, divName, city, "Operations", pattern.ops * multiplier)
		assignNewEmployees(ns, divName, city, "Engineer", pattern.eng * multiplier)
		assignNewEmployees(ns, divName, city, "Business", pattern.bus * multiplier)
		assignNewEmployees(ns, divName, city, "Management", pattern.mgt * multiplier)
		assignNewEmployees(ns, divName, city, "Research & Development", pattern.rnd * multiplier)
		assignNewEmployees(ns, divName, city, "Intern", pattern.int * multiplier)
	}
}

function extractJobsPattern(ns: NS, div: string, city: CityName, ): jobsCount {
	const nsc = ns.corporation
	const office = nsc.getOffice(div, city)
	const officeJobs = office.employeeJobs
	const total = office.numEmployees
	const ops = officeJobs["Operations"]
	const eng = officeJobs["Engineer"]
	const bus = officeJobs["Business"]
	const mgt = officeJobs["Management"]
	const rnd = officeJobs["Research & Development"]
	const int = officeJobs["Intern"]
	const divisor = gcd(gcd(gcd(ops, eng), gcd(bus, mgt)), gcd(rnd, int))
	return {
		ops: ops / divisor,
		eng: eng / divisor,
		bus: bus / divisor,
		mgt: mgt / divisor,
		rnd: rnd / divisor,
		int: int / divisor,
	}
}

function gcd(a: number, b: number): number {
  while (b) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

function assignNewEmployees(ns: NS, div: string, city: CityName, jobType: jobTypes, count: number): boolean {
	const nsc = ns.corporation
	ns.tprintf("Hiring %i %s for %s's %s office", count, jobType, div, city)
	for (let i = 0; i < count; i++) {
		if (!nsc.hireEmployee(div, city, jobType)) {
			ns.tprintf("Failed to hire %s for %s's %s office", jobType, div, city)
			return false
		}
	}
	return true
}

type jobTypes =
	"Operations" |
	"Engineer" |
	"Business" |
	"Management" |
	"Research & Development" |
	"Intern"

const job = {
	ops: "Operations",
	eng: "Engineer",
	bus: "Business",
	mgt: "Management",
	rnd: "Research & Development",
	int: "Intern",
//	una: "Unassigned"
}

interface jobsCount {
	ops: number,
	eng: number,
	bus: number,
	mgt: number,
	rnd: number,
	int: number,
}