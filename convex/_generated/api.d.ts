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
import type * as cbt from "../cbt.js";
import type * as companion from "../companion.js";
import type * as counsellorRequests from "../counsellorRequests.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as emotionLogs from "../emotionLogs.js";
import type * as emotionMaps from "../emotionMaps.js";
import type * as followUps from "../followUps.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as jpmrLogs from "../jpmrLogs.js";
import type * as jpmrVideos from "../jpmrVideos.js";
import type * as microGoals from "../microGoals.js";
import type * as patients from "../patients.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as reframes from "../reframes.js";
import type * as reinforcement from "../reinforcement.js";
import type * as screening from "../screening.js";
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
  cbt: typeof cbt;
  companion: typeof companion;
  counsellorRequests: typeof counsellorRequests;
  crons: typeof crons;
  dashboard: typeof dashboard;
  emotionLogs: typeof emotionLogs;
  emotionMaps: typeof emotionMaps;
  followUps: typeof followUps;
  http: typeof http;
  insights: typeof insights;
  jpmrLogs: typeof jpmrLogs;
  jpmrVideos: typeof jpmrVideos;
  microGoals: typeof microGoals;
  patients: typeof patients;
  rateLimiter: typeof rateLimiter;
  reframes: typeof reframes;
  reinforcement: typeof reinforcement;
  screening: typeof screening;
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
