/**
 * Beta test labelling. On by default, because every build shared today is a test build.
 * A release build turns it off with EXPO_PUBLIC_BETA=false (EAS environment variable).
 */
export function isBetaBuild(flag: string | undefined = process.env.EXPO_PUBLIC_BETA): boolean {
  return (flag ?? "").trim().toLowerCase() !== "false";
}

/** Bump to show the beta notice again to everyone (e.g. when its content changes). */
export const BETA_NOTICE_VERSION = "1";
export const BETA_NOTICE_KEY = `beta_notice_ack_v${BETA_NOTICE_VERSION}`;
