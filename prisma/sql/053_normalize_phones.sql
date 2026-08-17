-- HR_ERP — One-time phone normalization (2026-08-17 round 5, follow-up to 052).
--
-- WHY
--   Phones are now stored as ONE sequence "+<dial><digits>" (no spaces), with the national
--   number length validated per country in the app. Existing rows hold free-format values
--   ("+20 100 123 4567", "0100-123-4567"). This pass normalizes what CONFIDENTLY parses and
--   leaves everything else untouched — an ambiguous value is corrected by its owner the next
--   time they edit, never guessed here. Mirrors `normalizeLoosePhone` in src/lib/phone.ts:
--     1. Strip spaces, dots, dashes, parentheses.
--     2. "+<8-15 digits>"            → keep as-is (stripped).
--     3. "00<8-15 digits>"           → "+" + rest (international 00 prefix).
--     4. "01<9 digits>" (11 digits)  → "+20" + last 10 (Egyptian local mobile format).
--
-- SAFETY
--   Updates only rows whose cleaned value matches one of the three confident shapes AND
--   actually changes. No schema change; re-running is a no-op (already-normalized values
--   match shape 2 and are already stripped).
--
-- ORDER: run after 052.

DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['phone', 'emergencyContactPhone'] LOOP
    -- Shape 2: already has +country code — just strip separators.
    EXECUTE format($f$
      UPDATE "User"
      SET %1$I = regexp_replace(%1$I, '[\s().\-]', '', 'g')
      WHERE %1$I IS NOT NULL
        AND regexp_replace(%1$I, '[\s().\-]', '', 'g') ~ '^\+[0-9]{8,15}$'
        AND %1$I <> regexp_replace(%1$I, '[\s().\-]', '', 'g')
    $f$, col);

    -- Shape 3: international 00 prefix → +.
    EXECUTE format($f$
      UPDATE "User"
      SET %1$I = '+' || substr(regexp_replace(%1$I, '[\s().\-]', '', 'g'), 3)
      WHERE %1$I IS NOT NULL
        AND regexp_replace(%1$I, '[\s().\-]', '', 'g') ~ '^00[0-9]{8,15}$'
    $f$, col);

    -- Shape 4: Egyptian local mobile 01XXXXXXXXX → +20 1XXXXXXXXX.
    EXECUTE format($f$
      UPDATE "User"
      SET %1$I = '+20' || substr(regexp_replace(%1$I, '[\s().\-]', '', 'g'), 2)
      WHERE %1$I IS NOT NULL
        AND regexp_replace(%1$I, '[\s().\-]', '', 'g') ~ '^01[0-9]{9}$'
    $f$, col);
  END LOOP;
END $$;
