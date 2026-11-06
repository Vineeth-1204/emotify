/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { getCompanionDisplayName, readStoredEmotyPreferences } from "../common/companionName";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function setup(storedName?: string) {
  const t = convexTest(schema, modules);
  let studentId!: Id<"users">;
  await t.run(async (ctx) => {
    studentId = await ctx.db.insert("users", {
      full_name: "Compat Student",
      role: "patient",
      status: "active",
      ...(storedName
        ? { mitraPreferences: { name: storedName, avatarGender: "male", avatarVariant: "default", updatedAt: 1 } }
        : {}),
    });
  });
  return { t, studentId, asStudent: t.withIdentity({ subject: studentId }) };
}

// Pre-Emoty names that installed app versions still call.
const LEGACY_NAME = "Mitra";

describe("Emoty is the only companion identity", () => {
  test("a stored legacy default name is displayed as Emoty", async () => {
    expect(getCompanionDisplayName(LEGACY_NAME)).toBe("Emoty");
    expect(getCompanionDisplayName(` ${LEGACY_NAME.toLowerCase()} `)).toBe("Emoty");
    expect(getCompanionDisplayName("Luna")).toBe("Luna");

    const { asStudent, studentId } = await setup(LEGACY_NAME);
    const prefs = await asStudent.query(api.users.getEmotyPreferences, { userId: studentId });
    expect(prefs.name).toBe("Emoty");
    expect(prefs.avatarGender).toBe("male");
  });

  test("updating any preference stores Emoty in place of the legacy default name", async () => {
    const { t, asStudent, studentId } = await setup(LEGACY_NAME);
    await asStudent.mutation(api.users.updateEmotyPreferences, { userId: studentId, avatarGender: "female" });
    const doc = await t.run(async (ctx) => ctx.db.get(studentId));
    expect(readStoredEmotyPreferences(doc as any)).toMatchObject({ name: "Emoty", avatarGender: "female" });
  });

  test("a custom companion name is preserved", async () => {
    const { asStudent, studentId } = await setup("Sathi");
    expect((await asStudent.query(api.users.getEmotyPreferences, { userId: studentId })).name).toBe("Sathi");
  });

  test("pre-Emoty API names still work for installed app versions (deprecated aliases)", async () => {
    const { asStudent, studentId } = await setup("Sathi");
    const users = api.users as any;
    const microGoals = api.microGoals as any;

    const viaNew = await asStudent.query(api.users.getEmotyPreferences, { userId: studentId });
    const viaOld = await asStudent.query(users["getMitraPreferences"], { userId: studentId });
    expect(viaOld).toEqual(viaNew);

    await asStudent.mutation(users["updateMitraPreferences"], { userId: studentId, name: "Buddy" });
    expect((await asStudent.query(api.users.getEmotyPreferences, { userId: studentId })).name).toBe("Buddy");

    const dateStr = "2026-10-03";
    const suggestedNew = await asStudent.query(api.microGoals.getEmotySuggestedGoal, { dateStr });
    const suggestedOld = await asStudent.query(microGoals["getMitraSuggestedGoal"], { dateStr });
    expect(suggestedOld).toEqual(suggestedNew);
  });

  test("the deprecated aliases are public functions sharing the new handlers", async () => {
    const usersModule: any = await import("./users");
    const goalsModule: any = await import("./microGoals");
    for (const [mod, name] of [
      [usersModule, "getMitraPreferences"],
      [usersModule, "updateMitraPreferences"],
      [goalsModule, "getMitraSuggestedGoal"],
      [goalsModule, "acceptMitraGoal"],
      [goalsModule, "skipMitraGoal"],
    ] as const) {
      expect(mod[name], name).toBeDefined();
      expect(mod[name].isPublic, name).toBe(true);
    }
  });
});
