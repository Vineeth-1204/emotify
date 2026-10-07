/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alerts from "../alerts.js";
import type * as appointments from "../appointments.js";
import type * as audit from "../audit.js";
import type * as authHelpers from "../authHelpers.js";
import type * as authz from "../authz.js";
import type * as breathing from "../breathing.js";
import type * as cbt from "../cbt.js";
import type * as clinicalScoring from "../clinicalScoring.js";
import type * as companion from "../companion.js";
import type * as companionQuickActions from "../companionQuickActions.js";
import type * as counsellorAssignments from "../counsellorAssignments.js";
import type * as counsellorRequests from "../counsellorRequests.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as emotionLogs from "../emotionLogs.js";
import type * as emotionMaps from "../emotionMaps.js";
import type * as emotyActionRouter from "../emotyActionRouter.js";
import type * as emotyAvatar from "../emotyAvatar.js";
import type * as emotyContext from "../emotyContext.js";
import type * as emotyContract from "../emotyContract.js";
import type * as emotyFallback from "../emotyFallback.js";
import type * as emotyIntent from "../emotyIntent.js";
import type * as emotyMemory from "../emotyMemory.js";
import type * as emotyRateLimiter from "../emotyRateLimiter.js";
import type * as emotySafety from "../emotySafety.js";
import type * as emotyTelemetry from "../emotyTelemetry.js";
import type * as followUps from "../followUps.js";
import type * as functions from "../functions.js";
import type * as grounding from "../grounding.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as jpmrLogs from "../jpmrLogs.js";
import type * as jpmrVideos from "../jpmrVideos.js";
import type * as microGoals from "../microGoals.js";
import type * as patients from "../patients.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as reframes from "../reframes.js";
import type * as reinforcement from "../reinforcement.js";
import type * as sanitizer from "../sanitizer.js";
import type * as screening from "../screening.js";
import type * as sessionAuth from "../sessionAuth.js";
import type * as timeline from "../timeline.js";
import type * as triage from "../triage.js";
import type * as tts from "../tts.js";
import type * as users from "../users.js";
import type * as wellness from "../wellness.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  alerts: typeof alerts;
  appointments: typeof appointments;
  audit: typeof audit;
  authHelpers: typeof authHelpers;
  authz: typeof authz;
  breathing: typeof breathing;
  cbt: typeof cbt;
  clinicalScoring: typeof clinicalScoring;
  companion: typeof companion;
  companionQuickActions: typeof companionQuickActions;
  counsellorAssignments: typeof counsellorAssignments;
  counsellorRequests: typeof counsellorRequests;
  crons: typeof crons;
  dashboard: typeof dashboard;
  emotionLogs: typeof emotionLogs;
  emotionMaps: typeof emotionMaps;
  emotyActionRouter: typeof emotyActionRouter;
  emotyAvatar: typeof emotyAvatar;
  emotyContext: typeof emotyContext;
  emotyContract: typeof emotyContract;
  emotyFallback: typeof emotyFallback;
  emotyIntent: typeof emotyIntent;
  emotyMemory: typeof emotyMemory;
  emotyRateLimiter: typeof emotyRateLimiter;
  emotySafety: typeof emotySafety;
  emotyTelemetry: typeof emotyTelemetry;
  followUps: typeof followUps;
  functions: typeof functions;
  grounding: typeof grounding;
  http: typeof http;
  insights: typeof insights;
  jpmrLogs: typeof jpmrLogs;
  jpmrVideos: typeof jpmrVideos;
  microGoals: typeof microGoals;
  patients: typeof patients;
  rateLimiter: typeof rateLimiter;
  reframes: typeof reframes;
  reinforcement: typeof reinforcement;
  sanitizer: typeof sanitizer;
  screening: typeof screening;
  sessionAuth: typeof sessionAuth;
  timeline: typeof timeline;
  triage: typeof triage;
  tts: typeof tts;
  users: typeof users;
  wellness: typeof wellness;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
