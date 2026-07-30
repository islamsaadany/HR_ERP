import type { OnboardingTrackKey, User } from "@prisma/client";

/** Suggested stage labels for the admin form (free-text; any value is allowed). */
export const STAGE_SUGGESTIONS = [
  "Week 1",
  "Week 2",
  "Week 3",
  "Week 4",
  "Week 5",
  "Week 6",
  "Week 7",
  "Week 8",
  "Check-ins",
];

/**
 * Group activities (already sorted by `order`) into ordered stage buckets.
 * A stage's position follows its first (lowest-`order`) activity, so ordering
 * is driven entirely by the `order` field — no fixed enum, no migrations to add weeks.
 */
export function groupByStage<T extends { stage: string }>(activities: T[]): { stage: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const a of activities) {
    if (!map.has(a.stage)) {
      map.set(a.stage, []);
      order.push(a.stage);
    }
    map.get(a.stage)!.push(a);
  }
  return order.map((stage) => ({ stage, items: map.get(stage)! }));
}

export const TRACK_LABEL: Record<OnboardingTrackKey, string> = {
  COMMON_CORE: "Everyone",
  CONSULTING: "Consulting",
};

/** Which extra role tracks does this employee get, on top of COMMON_CORE? */
export function tracksForUser(
  user: Pick<User, "department">
): OnboardingTrackKey[] {
  const tracks: OnboardingTrackKey[] = ["COMMON_CORE"];
  if ((user.department ?? "").toLowerCase().includes("consulting")) {
    tracks.push("CONSULTING");
  }
  return tracks;
}
