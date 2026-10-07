/**
 * Public Convex function builders with server-side session enforcement.
 *
 * Every public query, mutation and action in this app must be built with these
 * wrappers instead of the raw builders from "./_generated/server". Inside a
 * wrapped function, `ctx.auth.getUserIdentity()` returns the caller's identity
 * only if their token is backed by a live session (see sessionAuth.ts);
 * otherwise it returns null, exactly as for an anonymous caller.
 *
 * Internal functions keep the raw builders: they can only be reached through a
 * wrapped public function, which has already validated the caller.
 */
import {
  query as rawQuery,
  mutation as rawMutation,
  action as rawAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { validateSessionIdentity } from "./sessionAuth";

type AnyDefinition = any;

function withHandler(definition: AnyDefinition, wrapCtx: (ctx: any) => any): AnyDefinition {
  if (typeof definition === "function") {
    return (ctx: any, args: any) => definition(wrapCtx(ctx), args);
  }
  return {
    ...definition,
    handler: (ctx: any, args: any) => definition.handler(wrapCtx(ctx), args),
  };
}

function withValidatedDbAuth(ctx: any) {
  let cached: Promise<any> | undefined;
  const auth = {
    ...ctx.auth,
    getUserIdentity: () => {
      if (!cached) {
        cached = (async () => {
          const identity = await ctx.auth.getUserIdentity();
          if (!identity) return null;
          const user = await validateSessionIdentity(ctx.db, identity);
          return user ? identity : null;
        })();
      }
      return cached;
    },
  };
  return { ...ctx, auth };
}

function withValidatedActionAuth(ctx: any) {
  let cached: Promise<any> | undefined;
  const auth = {
    ...ctx.auth,
    getUserIdentity: () => {
      if (!cached) {
        cached = (async () => {
          const identity = await ctx.auth.getUserIdentity();
          if (!identity) return null;
          const valid = await ctx.runQuery(internal.sessionAuth.isCallerSessionValid, {});
          return valid ? identity : null;
        })();
      }
      return cached;
    },
  };
  return { ...ctx, auth };
}

export const query: typeof rawQuery = ((definition: AnyDefinition) =>
  rawQuery(withHandler(definition, withValidatedDbAuth))) as typeof rawQuery;

export const mutation: typeof rawMutation = ((definition: AnyDefinition) =>
  rawMutation(withHandler(definition, withValidatedDbAuth))) as typeof rawMutation;

export const action: typeof rawAction = ((definition: AnyDefinition) =>
  rawAction(withHandler(definition, withValidatedActionAuth))) as typeof rawAction;
