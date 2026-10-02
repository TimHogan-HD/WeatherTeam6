import type { OutlookDay } from './index.js';

type MemberCounts = Pick<OutlookDay, 'members_wet' | 'member_count'>;

/**
 * The share of the forecast runs on the majority side of rain or no rain for
 * one day, 0.5 to 1. **A count, not a confidence**: it says how many runs
 * agree, not how likely they are to be right, so it is never labelled one.
 *
 * `null` when no member reached the day or the wet count is unknown: withheld,
 * never read as full agreement or as none.
 */
export function agreementShare(day: MemberCounts): number | null {
  if (day.members_wet === null || day.member_count <= 0) return null;
  const wet = day.members_wet;
  return Math.max(wet, day.member_count - wet) / day.member_count;
}

/** The chance of measurable rain, `members_wet / member_count`. `null` when unknown, never 0. */
export function rainChanceShare(day: MemberCounts): number | null {
  if (day.members_wet === null || day.member_count <= 0) return null;
  return day.members_wet / day.member_count;
}

export const AGREEMENT_LABEL = 'Agreement';

/** What the chip measures, said once, where the trip screen explains its figures. */
export const AGREEMENT_MEANING =
  'Agreement is the share of forecast runs that agree on rain or no rain that day.';
