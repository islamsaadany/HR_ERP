/**
 * The seven ways a course can name who takes it — the Access tab's fields.
 *
 * THIS LIVES HERE, NOT IN `access-actions.ts`, AND THAT IS THE WHOLE POINT.
 *
 * A `"use server"` file may export NOTHING but async functions. It used to export this array as
 * well, and the cost was total: Next validates a page's whole server-action entry when the first
 * action on that page is called, so one non-function export made EVERY action on the course page
 * throw before it ran — the Everyone / Only-certain-people switch, adding people, removing a
 * choice, and Publish alike. Each came back as a bare 500 with no message, because the failure is
 * in the action entry rather than in any code that could report it.
 *
 * Nothing catches this: it is not a type error, and `next build` compiles it happily — the check
 * is generated code that runs when the action module loads. So the rule has to be kept by hand:
 * if a value, an array, a type's runtime twin, or anything else that is not an async function
 * belongs beside some actions, it goes in a plain module like this one and the action file
 * imports it.
 */
export const ACCESS_FIELDS = [
  "DEPARTMENT",
  "BUSINESS_UNIT",
  "EMPLOYMENT_TYPE",
  "TENURE_BAND",
  "REPORTS_TO",
  "GROUP",
  "PERSON",
] as const;

export type AccessField = (typeof ACCESS_FIELDS)[number];
