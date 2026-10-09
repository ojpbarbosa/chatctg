import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json" with { type: "json" };

countries.registerLocale(en);

/** The registry's spellings that the library does not resolve by name. */
const OVERRIDES: Record<string, string> = {
  "Korea, Republic of": "KOR", "Korea, Democratic People's Republic of": "PRK", "Russian Federation": "RUS", "Taiwan": "TWN",
  "Türkiye": "TUR", "Turkey": "TUR", "Iran, Islamic Republic of": "IRN", "Viet Nam": "VNM", "Czechia": "CZE", "Czech Republic": "CZE",
  "Moldova, Republic of": "MDA", "Tanzania": "TZA", "Bolivia": "BOL", "Venezuela": "VEN", "Syrian Arab Republic": "SYR",
  "Lao People's Democratic Republic": "LAO", "Macedonia, The Former Yugoslav Republic of": "MKD", "North Macedonia": "MKD",
  "Congo, The Democratic Republic of the": "COD", "Côte D'Ivoire": "CIV", "Hong Kong": "HKG", "Macao": "MAC", "Palestinian Territory, occupied": "PSE",
  "Brunei Darussalam": "BRN", "Libyan Arab Jamahiriya": "LBY", "Micronesia, Federated States of": "FSM", "Holy See (Vatican City State)": "VAT",
  "United States": "USA", "United Kingdom": "GBR",
  "Moldova": "MDA", "Swaziland": "SWZ", "Burma": "MMR", "Cabo Verde": "CPV", "Réunion": "REU", "Virgin Islands (U.S.)": "VIR",
  "Macau": "MAC", "Laos": "LAO", "Syria": "SYR", "Palestine, State of": "PSE", "Micronesia": "FSM", "Holy See": "VAT", "Saint Martin": "MAF",
};

function lookup(name: string): string | null {
  if (!name) return null;
  if (Object.hasOwn(OVERRIDES, name)) return OVERRIDES[name]!;
  const alpha2 = countries.getAlpha2Code(name, "en");
  return alpha2 ? (countries.alpha2ToAlpha3(alpha2) ?? null) : null;
}

/** The ISO 3166 alpha-3 code for a registry country name. "Turkey (Türkiye)" tries the full name, then "Turkey", then "Türkiye". */
export function iso3(country: string): string | null {
  const name = country.trim();
  const direct = lookup(name);
  if (direct) return direct;
  const paren = /^(.+?)\s*\(([^()]+)\)$/.exec(name);
  return paren ? (lookup(paren[1]!.trim()) ?? lookup(paren[2]!.trim())) : null;
}

export function iso3ToNumeric(code: string): string | null {
  return countries.alpha3ToNumeric(code) ?? null;
}
