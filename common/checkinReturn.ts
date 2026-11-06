/**
 * Return path from a tool launched by the guided check-in (How I'm Feeling).
 *
 * The check-in saves its pending state, opens the tool with `returnTo=emotion_map_post`, and
 * expects the tool to send the student back with `postSession=1` once the activity is finished,
 * so the "How do you feel now?" re-check can run. Tools opened any other way are unaffected.
 */
export const CHECKIN_RETURN_TO = "emotion_map_post";

export const CHECKIN_POST_SESSION_HREF = {
  pathname: "/(auth)/tools/emotion-map",
  params: { postSession: "1" },
} as const;

/** True when the tool was opened by the guided check-in and should hand back to it. */
export function isCheckinReturn(returnTo: string | string[] | null | undefined): boolean {
  const value = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  return value === CHECKIN_RETURN_TO;
}
