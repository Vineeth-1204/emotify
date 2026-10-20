/**
 * Appointment lifecycle shared by the server (authority), the student app and the staff
 * dashboard (labels and which buttons to show).
 *
 *   requested (pending) --receiver accepts--> confirmed (accepted)
 *                       --receiver declines--> declined (rejected)
 *                       --either proposes a new time--> new time proposed (waiting)
 *   new time proposed (waiting) --receiver accepts--> confirmed (new time applied)
 *                               --receiver declines--> declined
 *                               --either proposes again--> new time proposed
 *   confirmed (accepted | legacy scheduled) --counsellor/admin--> completed
 *                                           --either proposes a new time--> new time proposed
 *   any open status --student withdraws/cancels or staff cancels--> cancelled
 *
 * The "receiver" is the party who did not make the latest proposal: a student's request
 * (createdBy "user") or a student's new time (rescheduledBy "user") is answered by the
 * counsellor/admin, and a staff proposal is answered by the student. Nobody confirms their own
 * proposal. Only staff complete an appointment; a student can add feedback afterwards.
 * Stored status values are unchanged from the existing data so old records stay valid.
 */

export type AppointmentStatus = "pending" | "waiting" | "accepted" | "scheduled" | "rejected" | "cancelled" | "completed";
export type AppointmentActor = "student" | "staff";
export type AppointmentAction = "accept" | "decline" | "propose_time" | "cancel" | "complete" | "feedback";

export const OPEN_STATUSES = new Set(["pending", "waiting", "accepted", "scheduled"]);
export const TERMINAL_STATUSES = new Set(["completed", "cancelled", "rejected"]);
export const CONFIRMED_STATUSES = new Set(["accepted", "scheduled"]);

export interface AppointmentLike {
  status: string;
  createdBy?: string; // "admin" | "user"
  rescheduledBy?: string; // "admin" | "user"
  isFeedbackCompleted?: boolean;
}

/** Who must answer the current proposal, or null when nothing is awaiting an answer. */
export function awaitingResponseFrom(appt: AppointmentLike): AppointmentActor | null {
  if (appt.status === "pending") return appt.createdBy === "admin" ? "student" : "staff";
  if (appt.status === "waiting") return appt.rescheduledBy === "admin" ? "student" : "staff";
  return null;
}

/** Actions the given party may take now. The server enforces exactly this. */
export function allowedActions(appt: AppointmentLike, actor: AppointmentActor): AppointmentAction[] {
  const actions: AppointmentAction[] = [];
  const open = OPEN_STATUSES.has(appt.status);
  if (awaitingResponseFrom(appt) === actor) actions.push("accept", "decline");
  if (open) actions.push("propose_time", "cancel");
  if (actor === "staff" && CONFIRMED_STATUSES.has(appt.status)) actions.push("complete");
  if (actor === "student" && (CONFIRMED_STATUSES.has(appt.status) || appt.status === "completed") && !appt.isFeedbackCompleted) {
    actions.push("feedback");
  }
  return actions;
}

export function canTakeAction(appt: AppointmentLike, actor: AppointmentActor, action: AppointmentAction): boolean {
  return allowedActions(appt, actor).includes(action);
}

/** Plain-language status for each audience. */
export function appointmentStatusLabel(appt: AppointmentLike, audience: AppointmentActor): string {
  const awaiting = awaitingResponseFrom(appt);
  switch (appt.status) {
    case "pending":
      if (audience === "student") return awaiting === "student" ? "Your counsellor suggested a time" : "Requested";
      return awaiting === "staff" ? "New request" : "Awaiting student";
    case "waiting":
      return awaiting === audience ? "New time proposed" : "Waiting for a reply";
    case "accepted":
    case "scheduled":
      return "Confirmed";
    case "rejected":
      return "Declined";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Completed";
    default:
      return "Requested";
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):([0-5]\d)\s?(AM|PM)$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Furthest a request may be made into the future. */
export const MAX_DAYS_AHEAD = 180;

/** "YYYY-MM-DD" that is a real calendar date, else null. */
export function parseAppointmentDate(date: string): { y: number; m: number; d: number } | null {
  const match = DATE_RE.exec((date || "").trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** "hh:mm AM|PM" -> minutes after midnight, else null. */
export function parseAppointmentTime(time: string): number | null {
  const match = TIME_RE.exec((time || "").trim());
  if (!match) return null;
  let h = Number(match[1]);
  const min = Number(match[2]);
  if (h < 1 || h > 12) return null;
  const pm = match[3].toUpperCase() === "PM";
  if (h === 12) h = 0;
  return (pm ? h + 12 : h) * 60 + min;
}

/** Normalised "YYYY-MM-DD HH:mm" (24h) used for conflict and duplicate checks. */
export function appointmentSlotKey(date: string, time: string): string | null {
  const d = parseAppointmentDate(date);
  const minutes = parseAppointmentTime(time);
  if (!d || minutes === null) return null;
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${date.trim()} ${hh}:${mm}`;
}

/**
 * Validates a requested date/time. The server does not know the student's timezone, so "in the
 * past" allows one day of slack (a date earlier than yesterday in UTC is refused).
 * Returns an error message, or null when valid.
 */
export function validateAppointmentSlot(date: string, time: string, now: number): string | null {
  const d = parseAppointmentDate(date);
  if (!d) return "Choose a valid date.";
  if (parseAppointmentTime(time) === null) return "Choose a valid time.";
  const day = Date.UTC(d.y, d.m - 1, d.d);
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  if (day < today - DAY_MS) return "Choose a date that has not passed.";
  if (day > today + MAX_DAYS_AHEAD * DAY_MS) return `Choose a date within the next ${MAX_DAYS_AHEAD} days.`;
  return null;
}
