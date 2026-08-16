-- HR_ERP — READ-ONLY. Who committed to medical before serving three months.
--
-- Nothing is changed by this file: it is a single SELECT. Paste it into the Neon SQL editor.
--
-- WHY IT EXISTS
--   Until the eligibility fix, the three-month gate asked "will this person be eligible at some
--   point inside the window?" rather than "are they eligible today". With the medical policy term
--   running to 14 Jun 2027, that let anyone whose three-month mark fell before then commit
--   immediately. This lists the commitments that got through, so HR can decide each one.
--
--   IT ALSO LISTS EMPLOYEES WITH NO START DATE. The eligibility rules fail SAFE toward paying —
--   an unknown hire date is treated as fully eligible — so someone with no start date passes both
--   the three-month medical gate and the six-month basket gate regardless of service. The first
--   version of this query filtered those rows out and came back empty, which read as "nobody got
--   through" when it actually meant "nobody could be checked".
--
--   It reports; it does not judge. Removing a commitment is a decision about a real person's
--   insurance cover, so it stays with HR — use the Remove button on Admin → Benefits.

SELECT
  CASE WHEN u."startDate" IS NULL THEN 'NO START DATE — eligibility never checked'
       ELSE 'committed early' END                     AS finding,
  u.name                                              AS employee,
  u.email,
  u."startDate"::date                                 AS started,
  mc."committedAt"::date                              AS committed,
  (u."startDate" + interval '3 months')::date         AS eligible_from,
  -- How early they were, in whole days. Bigger number = further outside the rule.
  EXTRACT(DAY FROM (u."startDate" + interval '3 months') - mc."committedAt")::int AS days_early,
  mc.premium                                          AS premium_egp
FROM "MedicalCommitment" mc
JOIN "User" u ON u.id = mc."userId"
WHERE u."startDate" IS NULL                                        -- gate could not be applied
   OR mc."committedAt" < u."startDate" + interval '3 months'       -- gate was applied and missed
ORDER BY days_early DESC NULLS FIRST;
