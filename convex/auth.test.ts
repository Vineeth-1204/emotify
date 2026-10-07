/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Student Authentication & Registration Suite (Priority 2)", () => {
  test("TEST 1: New student registration creates account & record in Convex", async () => {
    const t = convexTest(schema, modules);

    const regRes = await t.mutation(api.users.registerStudent, {
      full_name: "Maya Sharma",
      mobile_number: "9876543210",
      password: "studentpassword123",
      email: "maya.sharma@campus.edu",
    });

    expect(regRes.error).toBeUndefined();
    expect(regRes.token).toBeDefined();
    expect(regRes.user).toBeDefined();
    expect(regRes.user!.full_name).toBe("Maya Sharma");
    expect(regRes.user!.mobile_number).toBe("9876543210");
    expect(regRes.user!.role).toBe("patient");
    expect(regRes.user!.status).toBe("active");
    expect(regRes.user!.onboardingComplete).toBe(false);
    expect(regRes.user!.screeningComplete).toBe(false);

    // Verify record in Convex database
    const dbUser = await t.withIdentity({ subject: regRes.user!.id }).query(api.users.getByClerkId, {
      clerkId: regRes.user!.id,
    });
    expect(dbUser).toBeDefined();
    expect(dbUser?.full_name).toBe("Maya Sharma");
    expect(dbUser?.patientId).toBe("101");
  });

  test("TEST 2: Duplicate mobile identifier is rejected appropriately", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.users.registerStudent, {
      full_name: "Rahul Verma",
      mobile_number: "9812345678",
      password: "password123",
    });

    // Attempt to register with the same mobile number
    const dupRes = await t.mutation(api.users.registerStudent, {
      full_name: "Another Rahul",
      mobile_number: "9812345678",
      password: "differentpassword",
    });

    expect(dupRes.error).toBe("This mobile number is already registered. Please sign in.");
    expect(dupRes.token).toBeUndefined();
  });

  test("TEST 3: Incorrect password is rejected during login", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.users.registerStudent, {
      full_name: "Anita Roy",
      mobile_number: "9823456789",
      password: "correctpassword123",
    });

    const loginRes = await t.mutation(api.users.login, {
      mobile_number: "9823456789",
      password: "wrongpassword",
    });

    expect(loginRes.error).toBe("Invalid mobile number or password");
    expect(loginRes.token).toBeUndefined();
  });

  test("TEST 4: Correct credentials succeeds in logging in", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.users.registerStudent, {
      full_name: "Dev Patel",
      mobile_number: "9834567890",
      password: "secretdevpassword",
    });

    const loginRes = await t.mutation(api.users.login, {
      mobile_number: "9834567890",
      password: "secretdevpassword",
    });

    expect(loginRes.error).toBeUndefined();
    expect(loginRes.token).toBeDefined();
    expect(loginRes.user).toBeDefined();
    expect(loginRes.user!.full_name).toBe("Dev Patel");
    expect(loginRes.user!.mobile_number).toBe("9834567890");
  });

  test("TEST 5: New student has incomplete onboarding state", async () => {
    const t = convexTest(schema, modules);

    const regRes = await t.mutation(api.users.registerStudent, {
      full_name: "Sneha Nair",
      mobile_number: "9845678901",
      password: "password123",
    });

    const user = await t.withIdentity({ subject: regRes.user!.id }).query(api.users.getByClerkId, {
      clerkId: regRes.user!.id,
    });

    expect(user?.onboardingComplete).toBe(false);
    expect(user?.screeningComplete).toBe(false);
  });

  test("TEST 6: Completed onboarding but incomplete screening directs to screening", async () => {
    const t = convexTest(schema, modules);

    const regRes = await t.mutation(api.users.registerStudent, {
      full_name: "Karan Johar",
      mobile_number: "9856789012",
      password: "password123",
    });

    const userId = regRes.user!.id;

    // Complete onboarding with demographics
    await t.withIdentity({ subject: userId }).mutation(api.users.completeOnboarding, {
      userId,
      alias: "Karan J",
      age: 21,
      campus: "North Campus",
      department: "Psychology",
      year: "3rd Year",
      consentVersion: "1.0",
      consentTimestamp: Date.now(),
      emergencyContactName: "Parent",
      emergencyContactPhone: "9899999999",
    });

    const user = await t.withIdentity({ subject: userId }).query(api.users.getByClerkId, { clerkId: userId });
    expect(user?.onboardingComplete).toBe(true);
    expect(user?.screeningComplete).toBe(false);
    expect(user?.year).toBe("3rd Year");
    expect(user?.department).toBe("Psychology");
  });

  test("TEST 7: Completed onboarding + completed screening directs to main tabs", async () => {
    const t = convexTest(schema, modules);

    const regRes = await t.mutation(api.users.registerStudent, {
      full_name: "Pooja Bose",
      mobile_number: "9867890123",
      password: "password123",
    });

    const userId = regRes.user!.id;

    await t.withIdentity({ subject: userId }).mutation(api.users.completeOnboarding, {
      userId,
      alias: "Pooja",
      age: 19,
      campus: "South Campus",
      department: "Biotechnology",
      year: "1st Year",
      consentVersion: "1.0",
      consentTimestamp: Date.now(),
    });

    // Mark screening complete
    await t.withIdentity({ subject: userId }).mutation(api.users.markScreeningComplete, { clerkId: userId });

    const user = await t.withIdentity({ subject: userId }).query(api.users.getByClerkId, { clerkId: userId });
    expect(user?.onboardingComplete).toBe(true);
    expect(user?.screeningComplete).toBe(true);
  });

  test("TEST 8: Logout revokes session token", async () => {
    const t = convexTest(schema, modules);

    const regRes = await t.mutation(api.users.registerStudent, {
      full_name: "Vikram Seth",
      mobile_number: "9878901234",
      password: "password123",
    });

    const token = regRes.token!;

    // Session is active
    const isActiveBefore = await t.query(api.users.checkSessionActive, { token });
    expect(isActiveBefore).toBe(true);

    // Logout
    await t.mutation(api.users.logout, { token });

    // Session is revoked
    const isActiveAfter = await t.query(api.users.checkSessionActive, { token });
    expect(isActiveAfter).toBe(false);
  });

  test("TEST 9: Registered student appears in counselor listPatients", async () => {
    const t = convexTest(schema, modules);

    // Seed admin
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        clerkId: "seed-admin",
        full_name: "Admin User",
        mobile_number: "1234567890",
        role: "admin",
        status: "active",
        is_first_login: false,
      });
    });

    // Admin lists patients (with admin identity)
    const adminClient = t.withIdentity({
      subject: adminId,
      role: "admin",
    });

    // Get admin user from DB
    const admin = await adminClient.query(api.users.getByClerkId, { clerkId: "seed-admin" });
    expect(admin).toBeDefined();

    // Register a student
    const regRes = await t.mutation(api.users.registerStudent, {
      full_name: "Student Aakash",
      mobile_number: "9889012345",
      password: "password123",
    });

    const patients = await adminClient.query(api.users.listPatients, {});
    expect(patients.length).toBeGreaterThanOrEqual(1);

    const found = patients.find((p: any) => p.mobile_number === "9889012345");
    expect(found).toBeDefined();
    expect(found!.full_name).toBe("Student Aakash");
    expect(found!.patientId).toBeDefined();
  });

  test("TEST 10: Password hashes and secrets are NEVER visible to counselor/admin", async () => {
    const t = convexTest(schema, modules);

    // Seed admin
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        clerkId: "seed-admin",
        full_name: "Admin User",
        mobile_number: "1234567890",
        role: "admin",
        status: "active",
        is_first_login: false,
      });
    });

    const adminClient = t.withIdentity({
      subject: adminId,
      role: "admin",
    });

    const admin = await adminClient.query(api.users.getByClerkId, { clerkId: "seed-admin" });

    // Register a student
    const regRes = await t.mutation(api.users.registerStudent, {
      full_name: "Private Student",
      mobile_number: "9890123456",
      password: "supersecretpassword",
    });

    const patients = await adminClient.query(api.users.listPatients, {});
    const student = patients.find((p: any) => p.mobile_number === "9890123456");

    expect(student).toBeDefined();
    // Security verification: password_hash, temp_password, and biometricToken must be undefined
    expect(student.password_hash).toBeUndefined();
    expect(student.temp_password).toBeUndefined();
    expect(student.biometricToken).toBeUndefined();

    // Also verify getByClerkId does not expose secrets
    const userViaQuery = await adminClient.query(api.users.getByClerkId, { clerkId: student._id });
    expect(userViaQuery.password_hash).toBeUndefined();
    expect(userViaQuery.temp_password).toBeUndefined();
    expect(userViaQuery.biometricToken).toBeUndefined();
  });
});
