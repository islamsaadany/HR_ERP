"use client";

import { useState } from "react";
import {
  PHONE_COUNTRIES,
  countryFlag,
  nationalNumberError,
  phoneCountry,
  splitStoredPhone,
} from "@/lib/phone";

/**
 * Country-code dropdown + digits-only input (mockup-approved 2026-08-17 round 5).
 *
 * Emits the stored format "+<dial><digits>" through a hidden input (`name`) and the optional
 * `onValueChange` — one sequence, no spaces. A legacy value that doesn't parse leaves the
 * digits box holding its digits under the default country, and the hidden input keeps the
 * ORIGINAL value until the user actually types, so merely opening a form never rewrites data.
 */
export function PhoneInput({
  name,
  value,
  ariaLabel,
  onValueChange,
}: {
  /** Form field name for the combined stored value. */
  name: string;
  /** Current stored value ("" for none) — legacy formats tolerated. */
  value: string;
  ariaLabel?: string;
  /** Fires with the combined stored value on every user edit (for controlled forms). */
  onValueChange?: (combined: string) => void;
}) {
  const parsed = value ? splitStoredPhone(value) : null;
  const [iso, setIso] = useState(parsed?.country.iso ?? "EG");
  const [digits, setDigits] = useState(parsed ? parsed.digits : value.replace(/\D/g, ""));
  // Until the user touches the control, the form submits the value exactly as stored.
  const [touched, setTouched] = useState(false);

  const country = phoneCountry(iso) ?? PHONE_COUNTRIES[0];
  const combined = digits === "" ? "" : `+${country.dial}${digits}`;
  const error = touched && digits !== "" ? nationalNumberError(country, digits) : null;

  const emit = (nextIso: string, nextDigits: string) => {
    const c = phoneCountry(nextIso) ?? PHONE_COUNTRIES[0];
    onValueChange?.(nextDigits === "" ? "" : `+${c.dial}${nextDigits}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={name} value={touched ? combined : value} />
      <select
        value={iso}
        onChange={(e) => {
          setIso(e.target.value);
          setTouched(true);
          emit(e.target.value, digits);
        }}
        aria-label={`${ariaLabel ?? "Phone"} country code`}
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-navy-500 focus:outline-none"
      >
        {PHONE_COUNTRIES.map((c) => (
          <option key={c.iso} value={c.iso}>
            {countryFlag(c.iso)} {c.name} +{c.dial}
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="numeric"
        value={digits}
        onChange={(e) => {
          // Digits only, in sequence — anything else never enters the field.
          const next = e.target.value.replace(/\D/g, "");
          setDigits(next);
          setTouched(true);
          emit(iso, next);
        }}
        placeholder={country.min === country.max ? `${"x".repeat(country.min)}` : "digits"}
        aria-label={ariaLabel ?? "Phone number"}
        maxLength={country.max}
        className="w-full max-w-[170px] rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-navy-500 focus:outline-none"
      />
      {error ? <span className="w-full text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
