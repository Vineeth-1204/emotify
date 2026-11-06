/**
 * Which "My Counsellor" view the student profile shows, from the getMyCounsellor result
 * and the Convex connection state. Pure, so the states can be tested without a device.
 *
 * A missing result is "loading" while connecting and "offline" once the connection is
 * known to be down: a failed or pending request is never presented as "unassigned".
 */
export type MyCounsellorResult =
  | { status: "unauthenticated" }
  | { status: "not_student" }
  | { status: "unassigned" }
  | { status: "unavailable" }
  | { status: "assigned"; counsellor: { displayName: string; role: string; email: string | null; phone: string | null }; assignedAt: number };

export type MyCounsellorView = "hidden" | "loading" | "offline" | "signInAgain" | "unassigned" | "unavailable" | "assigned";

export interface ConnectionSnapshot {
  isWebSocketConnected: boolean;
  hasEverConnected: boolean;
  connectionRetries: number;
}

export function myCounsellorView(isReady: boolean, result: MyCounsellorResult | undefined, connection: ConnectionSnapshot): MyCounsellorView {
  if (result === undefined) {
    const offline = isReady && !connection.isWebSocketConnected && (connection.hasEverConnected || connection.connectionRetries > 0);
    return offline ? "offline" : "loading";
  }
  switch (result.status) {
    case "not_student":
      return "hidden";
    case "unauthenticated":
      return "signInAgain";
    case "unassigned":
      return "unassigned";
    case "unavailable":
      return "unavailable";
    case "assigned":
      return "assigned";
  }
}
