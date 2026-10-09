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
};

export function iso3(country: string): string | null {
  const name = country.trim();
  const direct = OVERRIDES[name];
  if (direct) return direct;
  const alpha2 = countries.getAlpha2Code(name, "en");
  if (!alpha2) return null;
  return countries.alpha2ToAlpha3(alpha2) ?? null;
}

export function iso3ToNumeric(code: string): string | null {
  return countries.alpha3ToNumeric(code) ?? null;
}
