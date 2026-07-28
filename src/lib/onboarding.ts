import type { OnboardingStage, OnboardingTrackKey, User } from "@prisma/client";

export const STAGE_ORDER: OnboardingStage[] = [
  "DAY_1",
  "WEEK_1",
  "FIRST_MONTH",
  "CHECK_INS",
];

export const STAGE_LABEL: Record<OnboardingStage, string> = {
  DAY_1: "Day 1",
  WEEK_1: "Week 1",
  FIRST_MONTH: "First month",
  CHECK_INS: "30 / 60 / 90",
};

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
