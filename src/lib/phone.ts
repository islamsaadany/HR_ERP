/**
 * Phone numbers with a country code (2026-08-17 round 5, mockup-approved).
 *
 * A phone is stored as ONE sequence: "+<dial><national number>" — digits only, no spaces
 * (e.g. "+201001234567"). The national-number length is validated PER COUNTRY (Egypt 10,
 * Saudi 9, UAE 9, …). Client-safe: no server imports, so the dropdown, the request form,
 * the admin form, the server actions, and the CSV importer all share this one module.
 *
 * Length data: exact for the countries this workforce actually dials; a safe range for the
 * long tail (a range can only under-reject, never wrongly reject a real number).
 */

export type PhoneCountry = {
  /** ISO 3166-1 alpha-2, uppercase. */
  iso: string;
  name: string;
  /** Dial code digits, no plus (e.g. "20"). */
  dial: string;
  /** Allowed national-number length (digits after the dial code), inclusive. */
  min: number;
  max: number;
};

// Egypt first (the default); the rest alphabetical by name.
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "EG", name: "Egypt", dial: "20", min: 10, max: 10 },
  { iso: "AF", name: "Afghanistan", dial: "93", min: 9, max: 9 },
  { iso: "AL", name: "Albania", dial: "355", min: 8, max: 9 },
  { iso: "DZ", name: "Algeria", dial: "213", min: 9, max: 9 },
  { iso: "AD", name: "Andorra", dial: "376", min: 6, max: 9 },
  { iso: "AO", name: "Angola", dial: "244", min: 9, max: 9 },
  { iso: "AR", name: "Argentina", dial: "54", min: 10, max: 11 },
  { iso: "AM", name: "Armenia", dial: "374", min: 8, max: 8 },
  { iso: "AU", name: "Australia", dial: "61", min: 9, max: 9 },
  { iso: "AT", name: "Austria", dial: "43", min: 7, max: 13 },
  { iso: "AZ", name: "Azerbaijan", dial: "994", min: 9, max: 9 },
  { iso: "BH", name: "Bahrain", dial: "973", min: 8, max: 8 },
  { iso: "BD", name: "Bangladesh", dial: "880", min: 10, max: 10 },
  { iso: "BY", name: "Belarus", dial: "375", min: 9, max: 9 },
  { iso: "BE", name: "Belgium", dial: "32", min: 8, max: 9 },
  { iso: "BJ", name: "Benin", dial: "229", min: 8, max: 8 },
  { iso: "BA", name: "Bosnia and Herzegovina", dial: "387", min: 8, max: 8 },
  { iso: "BW", name: "Botswana", dial: "267", min: 7, max: 8 },
  { iso: "BR", name: "Brazil", dial: "55", min: 10, max: 11 },
  { iso: "BN", name: "Brunei", dial: "673", min: 7, max: 7 },
  { iso: "BG", name: "Bulgaria", dial: "359", min: 8, max: 9 },
  { iso: "BF", name: "Burkina Faso", dial: "226", min: 8, max: 8 },
  { iso: "BI", name: "Burundi", dial: "257", min: 8, max: 8 },
  { iso: "KH", name: "Cambodia", dial: "855", min: 8, max: 9 },
  { iso: "CM", name: "Cameroon", dial: "237", min: 9, max: 9 },
  { iso: "CA", name: "Canada", dial: "1", min: 10, max: 10 },
  { iso: "TD", name: "Chad", dial: "235", min: 8, max: 8 },
  { iso: "CL", name: "Chile", dial: "56", min: 9, max: 9 },
  { iso: "CN", name: "China", dial: "86", min: 11, max: 11 },
  { iso: "CO", name: "Colombia", dial: "57", min: 10, max: 10 },
  { iso: "KM", name: "Comoros", dial: "269", min: 7, max: 7 },
  { iso: "CD", name: "Congo (DRC)", dial: "243", min: 9, max: 9 },
  { iso: "CG", name: "Congo (Republic)", dial: "242", min: 9, max: 9 },
  { iso: "CR", name: "Costa Rica", dial: "506", min: 8, max: 8 },
  { iso: "CI", name: "Côte d'Ivoire", dial: "225", min: 10, max: 10 },
  { iso: "HR", name: "Croatia", dial: "385", min: 8, max: 9 },
  { iso: "CU", name: "Cuba", dial: "53", min: 8, max: 8 },
  { iso: "CY", name: "Cyprus", dial: "357", min: 8, max: 8 },
  { iso: "CZ", name: "Czechia", dial: "420", min: 9, max: 9 },
  { iso: "DK", name: "Denmark", dial: "45", min: 8, max: 8 },
  { iso: "DJ", name: "Djibouti", dial: "253", min: 8, max: 8 },
  { iso: "DO", name: "Dominican Republic", dial: "1", min: 10, max: 10 },
  { iso: "EC", name: "Ecuador", dial: "593", min: 8, max: 9 },
  { iso: "SV", name: "El Salvador", dial: "503", min: 8, max: 8 },
  { iso: "ER", name: "Eritrea", dial: "291", min: 7, max: 7 },
  { iso: "EE", name: "Estonia", dial: "372", min: 7, max: 8 },
  { iso: "ET", name: "Ethiopia", dial: "251", min: 9, max: 9 },
  { iso: "FI", name: "Finland", dial: "358", min: 6, max: 11 },
  { iso: "FR", name: "France", dial: "33", min: 9, max: 9 },
  { iso: "GA", name: "Gabon", dial: "241", min: 7, max: 8 },
  { iso: "GM", name: "Gambia", dial: "220", min: 7, max: 7 },
  { iso: "GE", name: "Georgia", dial: "995", min: 9, max: 9 },
  { iso: "DE", name: "Germany", dial: "49", min: 7, max: 11 },
  { iso: "GH", name: "Ghana", dial: "233", min: 9, max: 9 },
  { iso: "GR", name: "Greece", dial: "30", min: 10, max: 10 },
  { iso: "GT", name: "Guatemala", dial: "502", min: 8, max: 8 },
  { iso: "GN", name: "Guinea", dial: "224", min: 8, max: 9 },
  { iso: "HN", name: "Honduras", dial: "504", min: 8, max: 8 },
  { iso: "HK", name: "Hong Kong", dial: "852", min: 8, max: 8 },
  { iso: "HU", name: "Hungary", dial: "36", min: 8, max: 9 },
  { iso: "IS", name: "Iceland", dial: "354", min: 7, max: 7 },
  { iso: "IN", name: "India", dial: "91", min: 10, max: 10 },
  { iso: "ID", name: "Indonesia", dial: "62", min: 9, max: 12 },
  { iso: "IR", name: "Iran", dial: "98", min: 10, max: 10 },
  { iso: "IQ", name: "Iraq", dial: "964", min: 10, max: 10 },
  { iso: "IE", name: "Ireland", dial: "353", min: 7, max: 9 },
  { iso: "IT", name: "Italy", dial: "39", min: 8, max: 11 },
  { iso: "JM", name: "Jamaica", dial: "1", min: 10, max: 10 },
  { iso: "JP", name: "Japan", dial: "81", min: 10, max: 10 },
  { iso: "JO", name: "Jordan", dial: "962", min: 9, max: 9 },
  { iso: "KZ", name: "Kazakhstan", dial: "7", min: 10, max: 10 },
  { iso: "KE", name: "Kenya", dial: "254", min: 9, max: 9 },
  { iso: "KW", name: "Kuwait", dial: "965", min: 8, max: 8 },
  { iso: "KG", name: "Kyrgyzstan", dial: "996", min: 9, max: 9 },
  { iso: "LA", name: "Laos", dial: "856", min: 8, max: 10 },
  { iso: "LV", name: "Latvia", dial: "371", min: 8, max: 8 },
  { iso: "LB", name: "Lebanon", dial: "961", min: 7, max: 8 },
  { iso: "LS", name: "Lesotho", dial: "266", min: 8, max: 8 },
  { iso: "LR", name: "Liberia", dial: "231", min: 7, max: 9 },
  { iso: "LY", name: "Libya", dial: "218", min: 9, max: 9 },
  { iso: "LT", name: "Lithuania", dial: "370", min: 8, max: 8 },
  { iso: "LU", name: "Luxembourg", dial: "352", min: 6, max: 9 },
  { iso: "MG", name: "Madagascar", dial: "261", min: 9, max: 9 },
  { iso: "MW", name: "Malawi", dial: "265", min: 8, max: 9 },
  { iso: "MY", name: "Malaysia", dial: "60", min: 9, max: 10 },
  { iso: "MV", name: "Maldives", dial: "960", min: 7, max: 7 },
  { iso: "ML", name: "Mali", dial: "223", min: 8, max: 8 },
  { iso: "MT", name: "Malta", dial: "356", min: 8, max: 8 },
  { iso: "MR", name: "Mauritania", dial: "222", min: 8, max: 8 },
  { iso: "MU", name: "Mauritius", dial: "230", min: 7, max: 8 },
  { iso: "MX", name: "Mexico", dial: "52", min: 10, max: 10 },
  { iso: "MD", name: "Moldova", dial: "373", min: 8, max: 8 },
  { iso: "MC", name: "Monaco", dial: "377", min: 8, max: 9 },
  { iso: "MN", name: "Mongolia", dial: "976", min: 8, max: 8 },
  { iso: "ME", name: "Montenegro", dial: "382", min: 8, max: 8 },
  { iso: "MA", name: "Morocco", dial: "212", min: 9, max: 9 },
  { iso: "MZ", name: "Mozambique", dial: "258", min: 9, max: 9 },
  { iso: "MM", name: "Myanmar", dial: "95", min: 8, max: 10 },
  { iso: "NA", name: "Namibia", dial: "264", min: 9, max: 9 },
  { iso: "NP", name: "Nepal", dial: "977", min: 10, max: 10 },
  { iso: "NL", name: "Netherlands", dial: "31", min: 9, max: 9 },
  { iso: "NZ", name: "New Zealand", dial: "64", min: 8, max: 10 },
  { iso: "NI", name: "Nicaragua", dial: "505", min: 8, max: 8 },
  { iso: "NE", name: "Niger", dial: "227", min: 8, max: 8 },
  { iso: "NG", name: "Nigeria", dial: "234", min: 10, max: 10 },
  { iso: "MK", name: "North Macedonia", dial: "389", min: 8, max: 8 },
  { iso: "NO", name: "Norway", dial: "47", min: 8, max: 8 },
  { iso: "OM", name: "Oman", dial: "968", min: 8, max: 8 },
  { iso: "PK", name: "Pakistan", dial: "92", min: 10, max: 10 },
  { iso: "PS", name: "Palestine", dial: "970", min: 9, max: 9 },
  { iso: "PA", name: "Panama", dial: "507", min: 7, max: 8 },
  { iso: "PY", name: "Paraguay", dial: "595", min: 9, max: 9 },
  { iso: "PE", name: "Peru", dial: "51", min: 9, max: 9 },
  { iso: "PH", name: "Philippines", dial: "63", min: 10, max: 10 },
  { iso: "PL", name: "Poland", dial: "48", min: 9, max: 9 },
  { iso: "PT", name: "Portugal", dial: "351", min: 9, max: 9 },
  { iso: "QA", name: "Qatar", dial: "974", min: 8, max: 8 },
  { iso: "RO", name: "Romania", dial: "40", min: 9, max: 9 },
  { iso: "RU", name: "Russia", dial: "7", min: 10, max: 10 },
  { iso: "RW", name: "Rwanda", dial: "250", min: 9, max: 9 },
  { iso: "SA", name: "Saudi Arabia", dial: "966", min: 9, max: 9 },
  { iso: "SN", name: "Senegal", dial: "221", min: 9, max: 9 },
  { iso: "RS", name: "Serbia", dial: "381", min: 8, max: 9 },
  { iso: "SL", name: "Sierra Leone", dial: "232", min: 8, max: 8 },
  { iso: "SG", name: "Singapore", dial: "65", min: 8, max: 8 },
  { iso: "SK", name: "Slovakia", dial: "421", min: 9, max: 9 },
  { iso: "SI", name: "Slovenia", dial: "386", min: 8, max: 8 },
  { iso: "SO", name: "Somalia", dial: "252", min: 7, max: 9 },
  { iso: "ZA", name: "South Africa", dial: "27", min: 9, max: 9 },
  { iso: "KR", name: "South Korea", dial: "82", min: 9, max: 10 },
  { iso: "SS", name: "South Sudan", dial: "211", min: 9, max: 9 },
  { iso: "ES", name: "Spain", dial: "34", min: 9, max: 9 },
  { iso: "LK", name: "Sri Lanka", dial: "94", min: 9, max: 9 },
  { iso: "SD", name: "Sudan", dial: "249", min: 9, max: 9 },
  { iso: "SE", name: "Sweden", dial: "46", min: 7, max: 10 },
  { iso: "CH", name: "Switzerland", dial: "41", min: 9, max: 9 },
  { iso: "SY", name: "Syria", dial: "963", min: 9, max: 9 },
  { iso: "TW", name: "Taiwan", dial: "886", min: 9, max: 9 },
  { iso: "TJ", name: "Tajikistan", dial: "992", min: 9, max: 9 },
  { iso: "TZ", name: "Tanzania", dial: "255", min: 9, max: 9 },
  { iso: "TH", name: "Thailand", dial: "66", min: 9, max: 9 },
  { iso: "TG", name: "Togo", dial: "228", min: 8, max: 8 },
  { iso: "TN", name: "Tunisia", dial: "216", min: 8, max: 8 },
  { iso: "TR", name: "Türkiye", dial: "90", min: 10, max: 10 },
  { iso: "TM", name: "Turkmenistan", dial: "993", min: 8, max: 8 },
  { iso: "UG", name: "Uganda", dial: "256", min: 9, max: 9 },
  { iso: "UA", name: "Ukraine", dial: "380", min: 9, max: 9 },
  { iso: "AE", name: "United Arab Emirates", dial: "971", min: 9, max: 9 },
  { iso: "GB", name: "United Kingdom", dial: "44", min: 9, max: 10 },
  { iso: "US", name: "United States", dial: "1", min: 10, max: 10 },
  { iso: "UY", name: "Uruguay", dial: "598", min: 8, max: 8 },
  { iso: "UZ", name: "Uzbekistan", dial: "998", min: 9, max: 9 },
  { iso: "VE", name: "Venezuela", dial: "58", min: 10, max: 10 },
  { iso: "VN", name: "Vietnam", dial: "84", min: 9, max: 10 },
  { iso: "YE", name: "Yemen", dial: "967", min: 9, max: 9 },
  { iso: "ZM", name: "Zambia", dial: "260", min: 9, max: 9 },
  { iso: "ZW", name: "Zimbabwe", dial: "263", min: 9, max: 9 },
];

/** 🇪🇬 from "EG" — derived, so the table stays emoji-free. */
export function countryFlag(iso: string): string {
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

const BY_ISO = new Map(PHONE_COUNTRIES.map((c) => [c.iso, c]));
// Longest dial code first so "+2126…" matches Morocco (212) before Egypt (20).
const BY_DIAL_DESC = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export function phoneCountry(iso: string): PhoneCountry | null {
  return BY_ISO.get(iso.toUpperCase()) ?? null;
}

/**
 * Split a stored "+<dial><digits>" value. Shared dial codes (+1, +7) resolve to the FIRST
 * table entry whose length range also fits, so a valid number never fails on a shared code.
 */
export function splitStoredPhone(
  stored: string
): { country: PhoneCountry; digits: string } | null {
  if (!/^\+\d+$/.test(stored)) return null;
  const all = stored.slice(1);
  const candidates = BY_DIAL_DESC.filter((c) => all.startsWith(c.dial));
  if (candidates.length === 0) return null;
  const fitting = candidates.find((c) => {
    const n = all.slice(c.dial.length).length;
    return n >= c.min && n <= c.max;
  });
  const country = fitting ?? candidates[0];
  return { country, digits: all.slice(country.dial.length) };
}

/** Human error for a national number against its country's rule, or null when it is fine. */
export function nationalNumberError(country: PhoneCountry, digits: string): string | null {
  if (!/^\d*$/.test(digits)) return "Digits only — no spaces or symbols.";
  if (digits.length < country.min || digits.length > country.max) {
    const want = country.min === country.max ? `${country.min}` : `${country.min}–${country.max}`;
    return `${country.name} numbers are ${want} digits after +${country.dial}.`;
  }
  return null;
}

/** Is a stored value a valid "+<dial><digits>" phone under the per-country rule? */
export function isValidStoredPhone(stored: string): boolean {
  const split = splitStoredPhone(stored);
  return split !== null && nationalNumberError(split.country, split.digits) === null;
}

/**
 * Best-effort normalisation of a legacy free-format value ("+20 100 123 4567",
 * "0100-123-4567", "0020…") into the stored format — or null when it doesn't confidently
 * parse. Mirrors migration 053 exactly, and is what the CSV importer runs before validating.
 */
export function normalizeLoosePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s().\-]/g, "");
  let candidate: string | null = null;
  if (/^\+\d{8,15}$/.test(cleaned)) candidate = cleaned;
  else if (/^00\d{8,15}$/.test(cleaned)) candidate = `+${cleaned.slice(2)}`;
  // Egyptian local mobile: 01XXXXXXXXX (11 digits) → +20 1XXXXXXXXX.
  else if (/^01\d{9}$/.test(cleaned)) candidate = `+20${cleaned.slice(1)}`;
  return candidate !== null && isValidStoredPhone(candidate) ? candidate : null;
}

/** The 14-digit national ID rule (no spaces, digits only). Empty is allowed elsewhere. */
export function isValidNationalId(value: string): boolean {
  return /^\d{14}$/.test(value);
}
