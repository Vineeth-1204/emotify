import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily cleanup of expired user sessions
crons.cron(
  "clear-expired-sessions",
  "0 0 * * *",
  internal.users.clearExpiredSessions,
  {}
);

// Adaptive student engagement notification scheduler: runs every 30 minutes
// Idempotently checks candidate windows, daily caps, quiet hours, and relevant incomplete actions
crons.interval(
  "evaluate-engagement-notifications",
  { minutes: 30 },
  internal.engagementScheduler.evaluateAllEligibleStudents,
  {}
);

// 60-minute MicroGoal reminder evaluator: runs every 15 minutes
crons.interval(
  "evaluate-microgoal-reminders",
  { minutes: 15 },
  internal.routines.evaluateMicroGoalReminders,
  {}
);

// Morning & evening routine reminder evaluator: runs every 30 minutes
crons.interval(
  "evaluate-routine-reminders",
  { minutes: 30 },
  internal.routines.evaluateDailyRoutineReminders,
  {}
);

export default crons;
