import { writeFile } from "node:fs/promises";

const headers = { "user-agent": "EloScope/1.0 (+mail@vincentvallet.com)" };
const [departmentsResponse, regionsResponse] = await Promise.all([
  fetch("https://geo.api.gouv.fr/departements?fields=nom,code,codeRegion&format=json", { headers }),
  fetch("https://geo.api.gouv.fr/regions?fields=nom,code&format=json", { headers }),
]);
if (!departmentsResponse.ok || !regionsResponse.ok) throw new Error("API géographique française indisponible");
const [departments, regions] = await Promise.all([departmentsResponse.json(), regionsResponse.json()]);
const regionNames = new Map(regions.map((region) => [region.code, region.nom]));
const output = departments
  .map((department) => ({
    code: department.code,
    name: department.nom,
    regionCode: department.codeRegion,
    regionName: regionNames.get(department.codeRegion),
  }))
  .sort((a, b) => a.code.localeCompare(b.code, "fr"));
if (!output.some((item) => item.code === "2A") || !output.some((item) => item.code === "971")) {
  throw new Error("Réponse géographique incomplète");
}
await writeFile(new URL("../data/french-departments.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Fixture générée: ${output.length} départements et collectivités`);
