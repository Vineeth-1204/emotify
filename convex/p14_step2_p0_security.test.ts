/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { readStoredEmotyPreferences } from "../common/companionName";

const modules = import.meta.glob("./**/*.ts");

describe("P14 Step 2: P0 Critical Vulnerability Remediation Suite", () => {
  async function setupSecurityEnvironment() {
    const t = convexTest(schema, modules);

    let studentAId = "";
    let studentBId = "";
    let counselorId = "";
    let adminId = "";

    await t.run(async (ctx) => {
      studentAId = await ctx.db.insert("users", {
        full_name: "Student Alpha",
        mobile_number: "9876543201",
        role: "patient",
        status: "active",
        patientId: "P-101",
        onboardingComplete: false,
        screeningComplete: false,
        created_at: 1700000001000,
        updated_at: 1700000001000,
      });

      studentBId = await ctx.db.insert("users", {
        full_name: "Student Beta",
        mobile_number: "9876543202",
        role: "patient",
        status: "active",
        patientId: "P-102",
        onboardingComplete: false,
        screeningComplete: false,
        created_at: 1700000002000,
        updated_at: 1700000002000,
      });

      counselorId = await ctx.db.insert("users", {
        full_name: "Staff Counselor",
        mobile_number: "9876543203",
        role: "counsellor",
        status: "active",
        created_at: 1700000003000,
        updated_at: 1700000003000,
      });

      adminId = await ctx.db.insert("users", {
        full_name: "System Administrator",
        mobile_number: "9876543204",
        role: "admin",
        status: "active",
        password_hash: "admin_original_hash",
        created_at: 1700000004000,
        updated_at: 1700000004000,
      });
    });

    const anon = t;
    const authedA = t.withIdentity({ subject: studentAId });
    const authedB = t.withIdentity({ subject: studentBId });
    const authedCounselor = t.withIdentity({ subject: counselorId });
    const authedAdmin = t.withIdentity({ subject: adminId });

    return {
      t,
      studentAId,
      studentBId,
      counselorId,
      adminId,
      anon,
      authedA,
      authedB,
      authedCounselor,
      authedAdmin,
    };
  }

  // =========================================================================
  // 1. EMOT-SEC-08: GEMINI API KEY EXPOSURE & OVERWRITE
  // =========================================================================
  describe("EMOT-SEC-08: Gemini API Key Exposure & Overwrite Remediation", () => {
    test("SEC-P0-01: Anonymous getActiveApiKey rejected", async () => {
      const { anon } = await setupSecurityEnvironment();
      await expect(anon.query(api.cbt.getActiveApiKey, {})).rejects.toThrow(
        /Unauthenticated|Login required|Admin access required/i
      );
    });

    test("SEC-P0-02: Anonymous insertApiKey rejected", async () => {
      const { anon } = await setupSecurityEnvironment();
      await expect(
        anon.mutation(api.cbt.insertApiKey, { key: "malicious_injected_key_123" })
      ).rejects.toThrow(/Unauthenticated|Login required|Admin access required/i);
    });

    test("SEC-P0-02b: Non-admin callers (student, counselor) cannot call insertApiKey or getActiveApiKey", async () => {
      const { authedA, authedCounselor } = await setupSecurityEnvironment();

      // Student attempt
      await expect(authedA.query(api.cbt.getActiveApiKey, {})).rejects.toThrow(
        /Unauthorized: Administrative access required/i
      );
      await expect(
        authedA.mutation(api.cbt.insertApiKey, { key: "student_key_attempt" })
      ).rejects.toThrow(/Unauthorized: Administrative access required/i);

      // Counselor attempt
      await expect(authedCounselor.query(api.cbt.getActiveApiKey, {})).rejects.toThrow(
        /Unauthorized: Administrative access required/i
      );
      await expect(
        authedCounselor.mutation(api.cbt.insertApiKey, { key: "counselor_key_attempt" })
      ).rejects.toThrow(/Unauthorized: Administrative access required/i);
    });

    test("SEC-P0-03: No public query returns plaintext Gemini API key", async () => {
      const { authedAdmin, t } = await setupSecurityEnvironment();

      // Seed a live key into apiKeys table
      await t.run(async (ctx) => {
        await ctx.db.insert("apiKeys", {
          key: "AIzaSySecretProductionGeminiKey9999",
          createdAt: Date.now(),
          expiresAt: Date.now() + 100000000,
        });
      });

      // Admin calls public getActiveApiKey
      const keyStatus = await authedAdmin.query(api.cbt.getActiveApiKey, {});
      expect(keyStatus).toBeDefined();
      expect(keyStatus.configured).toBe(true);

      // CRITICAL ASSERTION: The plaintext key MUST NOT be returned
      expect(JSON.stringify(keyStatus)).not.toContain("AIzaSySecretProductionGeminiKey9999");
      // Masked hint only
      expect(keyStatus.keyMasked).toBe("AIza...9999");
    });

    test("SEC-P0-04: Existing legitimate CBT/Gemini server flow can query internal key", async () => {
      const { t } = await setupSecurityEnvironment();

      // Seed key into apiKeys table
      await t.run(async (ctx) => {
        await ctx.db.insert("apiKeys", {
          key: "AIzaSyInternalServerKey12345",
          createdAt: Date.now(),
          expiresAt: Date.now() + 100000000,
        });
      });

      // Server actions run internal query directly
      const retrieved = await t.run(async (ctx) => {
        return await ctx.runQuery(internal.cbt.getActiveApiKeyInternal);
      });
      expect(retrieved).toBe("AIzaSyInternalServerKey12345");
    });
  });

  // =========================================================================
  // 2. EMOT-SEC-01: ADMIN CREDENTIAL RESET
  // =========================================================================
  describe("EMOT-SEC-01: Admin Credential Reset Remediation", () => {
    test("SEC-P0-05: Anonymous resetAdminCredentials rejected", async () => {
      const { anon } = await setupSecurityEnvironment();
      await expect(
        anon.mutation(api.users.resetAdminCredentials, {
          currentMobile: "9876543204",
          newPassword: "attacker_hijacked_password",
        })
      ).rejects.toThrow(/Unauthenticated|Login required|Admin access required/i);
    });

    test("SEC-P0-06: Student cannot reset admin credentials", async () => {
      const { authedA } = await setupSecurityEnvironment();
      await expect(
        authedA.mutation(api.users.resetAdminCredentials, {
          currentMobile: "9876543204",
          newPassword: "student_hijacked_password",
        })
      ).rejects.toThrow(/Unauthorized: Administrative access required/i);
    });

    test("SEC-P0-07: Counselor cannot reset admin credentials", async () => {
      const { authedCounselor } = await setupSecurityEnvironment();
      await expect(
        authedCounselor.mutation(api.users.resetAdminCredentials, {
          currentMobile: "9876543204",
          newPassword: "counselor_hijacked_password",
        })
      ).rejects.toThrow(/Unauthorized: Administrative access required/i);
    });

    test("SEC-P0-08: Authorized admin can reset administrator credentials", async () => {
      const { authedAdmin, t, adminId } = await setupSecurityEnvironment();

      const result = await authedAdmin.mutation(api.users.resetAdminCredentials, {
        currentMobile: "9876543204",
        newPassword: "BrandNewSecureAdminPass2026",
      });

      expect(result.success).toBe(true);

      const adminUser: any = await t.run(async (ctx) => {
        return await ctx.db.get(adminId as any);
      });
      expect(adminUser?.password_hash).not.toBe("admin_original_hash");
    });
  });

  // =========================================================================
  // 3. EMOT-SEC-04: completeOnboarding AUTHORIZATION BYPASS
  // =========================================================================
  describe("EMOT-SEC-04: completeOnboarding Authorization Bypass Remediation", () => {
    test("SEC-P0-09: Anonymous completeOnboarding rejected", async () => {
      const { anon, studentAId } = await setupSecurityEnvironment();
      await expect(
        anon.mutation(api.users.completeOnboarding, {
          userId: studentAId,
          alias: "Attacker Alias",
          age: 22,
          campus: "Attacker Campus",
          department: "Attacker Dept",
          consentVersion: "1.0",
          consentTimestamp: Date.now(),
          emergencyContactName: "Fake Contact",
          emergencyContactPhone: "0000000000",
        })
      ).rejects.toThrow(/Unauthenticated: Must be logged in to complete onboarding/i);
    });

    test("SEC-P0-10: Student cannot modify another student's onboarding", async () => {
      const { authedA, studentBId } = await setupSecurityEnvironment();
      await expect(
        authedA.mutation(api.users.completeOnboarding, {
          userId: studentBId,
          alias: "Malicious Student B Alias",
          age: 25,
          campus: "North Campus",
          department: "Hacked Dept",
          consentVersion: "1.0",
          consentTimestamp: Date.now(),
          emergencyContactName: "Malicious Parent",
          emergencyContactPhone: "1111111111",
        })
      ).rejects.toThrow(/Unauthorized: Cannot modify another student's onboarding/i);
    });

    test("SEC-P0-11: Student can complete their own onboarding", async () => {
      const { authedA, studentAId, t } = await setupSecurityEnvironment();

      const res = await authedA.mutation(api.users.completeOnboarding, {
        userId: studentAId,
        alias: "Alex A",
        age: 20,
        campus: "Main Campus",
        department: "Computer Science",
        year: "2nd Year",
        gender: "Non-binary",
        consentVersion: "1.0",
        consentTimestamp: Date.now(),
        emergencyContactName: "True Parent",
        emergencyContactPhone: "9876543210",
      });

      expect(res.success).toBe(true);

      const studentDoc: any = await t.run(async (ctx) => {
        return await ctx.db.get(studentAId as any);
      });
      expect(studentDoc?.onboardingComplete).toBe(true);
      expect(studentDoc?.alias).toBe("Alex A");
      expect(studentDoc?.department).toBe("Computer Science");
      expect(studentDoc?.campus).toBe("Main Campus");
    });

    test("SEC-P0-12: Emergency contact update remains functional for authorized owner", async () => {
      const { authedA, studentAId, t } = await setupSecurityEnvironment();

      await authedA.mutation(api.users.completeOnboarding, {
        userId: studentAId,
        alias: "Alex",
        age: 20,
        campus: "Main",
        department: "CS",
        consentVersion: "1.0",
        consentTimestamp: Date.now(),
        emergencyContactName: "Dr. Guardian",
        emergencyContactPhone: "9811223344",
      });

      const studentDoc: any = await t.run(async (ctx) => {
        return await ctx.db.get(studentAId as any);
      });
      expect(studentDoc?.emergencyContactName).toBe("Dr. Guardian");
      expect(studentDoc?.emergencyContactPhone).toBe("9811223344");
    });

    test("SEC-P0-13: Consent and Emoty preferences persist correctly for authenticated owner", async () => {
      const { authedA, studentAId, t } = await setupSecurityEnvironment();
      const ts = 1710000000000;

      await authedA.mutation(api.users.completeOnboarding, {
        userId: studentAId,
        alias: "Alex",
        age: 20,
        campus: "Main",
        department: "CS",
        consentVersion: "2.1",
        consentTimestamp: ts,
        emotyPreferences: {
          name: "Sathi",
          avatarGender: "male",
        },
      });

      const studentDoc: any = await t.run(async (ctx) => {
        return await ctx.db.get(studentAId as any);
      });
      expect(studentDoc?.consentVersion).toBe("2.1");
      expect(studentDoc?.consentTimestamp).toBe(ts);
      expect(readStoredEmotyPreferences(studentDoc)?.name).toBe("Sathi");
      expect(readStoredEmotyPreferences(studentDoc)?.avatarGender).toBe("male");
    });

    test("SEC-P0-13b: Staff (Admin) can complete onboarding for student with args.userId", async () => {
      const { authedAdmin, studentBId, t } = await setupSecurityEnvironment();

      const res = await authedAdmin.mutation(api.users.completeOnboarding, {
        userId: studentBId,
        alias: "Beta Assisted",
        age: 19,
        campus: "West Campus",
        department: "Economics",
        consentVersion: "1.0",
        consentTimestamp: Date.now(),
        emergencyContactName: "Staff Admin",
        emergencyContactPhone: "9988776655",
      });

      expect(res.success).toBe(true);

      const studentDoc: any = await t.run(async (ctx) => {
        return await ctx.db.get(studentBId as any);
      });
      expect(studentDoc?.onboardingComplete).toBe(true);
      expect(studentDoc?.alias).toBe("Beta Assisted");
    });
  });

  // =========================================================================
  // 4. EMOT-SEC-05: LEGACY SCREENING SCORE FORGERY
  // =========================================================================
  describe("EMOT-SEC-05: Legacy client-scored screening writer removed", () => {
    test("SEC-P0-14: submitScreening is no longer a callable public function", async () => {
      const { t, authedA, authedCounselor } = await setupSecurityEnvironment();
      for (const caller of [t, authedA, authedCounselor]) {
        await expect(
          caller.mutation((api.screening as any).submitScreening, {
            phq9_total: 5,
            gad7_total: 5,
            pq16_total: 0,
            phq9_item9_flag: false,
            phq9_item9_score: 0,
          })
        ).rejects.toThrow();
      }
      const rows = await t.run(async (ctx) => ctx.db.query("screenings").collect());
      expect(rows).toHaveLength(0);
    });
  });
});
