/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      admin: await user({ full_name: "Admin User", role: "admin", mobile_number: "9000000099" }),
      counsellor: await user({ full_name: "Counsellor Existing", role: "counsellor", mobile_number: "9000000088" }),
      student: await user({ full_name: "Student User", role: "patient", mobile_number: "9000000077" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  const asAdmin = as(ids.admin);
  const asStudent = as(ids.student);
  const asCounsellor = as(ids.counsellor);
  return { t, ...ids, as, asAdmin, asStudent, asCounsellor };
}

describe("Unified counsellor provisioning", () => {
  test("PROV-01: Admin successfully provisions counsellor account and linked directory entry in one transaction", async () => {
    const { t, asAdmin } = await setup();

    const res = await asAdmin.mutation(api.counsellorDirectory.provisionCounsellor, {
      name: "Dr. Sarah Rao",
      mobile_number: "9876543210",
      password: "SecurePassword123!",
      email: "sarah.rao@campus.edu",
      phone: "+91 98765 43210",
      campus: "Main Campus",
      role: "senior_psychiatrist",
      specialization: "Cognitive Behavioral Therapy, Anxiety",
      maxWorkload: 18,
    });

    expect(res.success).toBe(true);
    expect(res.userId).toBeDefined();
    expect(res.entryId).toBeDefined();
    expect(res.name).toBe("Dr. Sarah Rao");
    expect(res.mobile_number).toBe("9876543210");

    // Verify user document
    const userDoc: any = await t.run(async (ctx) => ctx.db.get(res.userId));
    expect(userDoc).toBeDefined();
    expect(userDoc.full_name).toBe("Dr. Sarah Rao");
    expect(userDoc.mobile_number).toBe("9876543210");
    expect(userDoc.role).toBe("counsellor"); // strictly assigned
    expect(userDoc.status).toBe("active");
    expect(userDoc.campus).toBe("Main Campus");
    expect(userDoc.password_hash).toBeDefined();
    expect(userDoc.password_hash).not.toBe("SecurePassword123!"); // hashed, never plain text

    // Verify directory document
    const entryDoc: any = await t.run(async (ctx) => ctx.db.get(res.entryId));
    expect(entryDoc).toBeDefined();
    expect(entryDoc.userId).toEqual(res.userId);
    expect(entryDoc.name).toBe("Dr. Sarah Rao");
    expect(entryDoc.email).toBe("sarah.rao@campus.edu");
    expect(entryDoc.role).toBe("senior_psychiatrist");
    expect(entryDoc.specialization).toBe("Cognitive Behavioral Therapy, Anxiety");
    expect(entryDoc.maxWorkload).toBe(18);
    expect(entryDoc.status).toBe("active");
    expect(entryDoc.shareEmailWithStudents).toBe(false);
    expect(entryDoc.sharePhoneWithStudents).toBe(false);

    // Verify audit log
    const auditLogs: any[] = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", "counsellor_provisioned")).collect()
    );
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    const lastAudit = auditLogs[auditLogs.length - 1];
    expect(lastAudit.details).toContain(res.userId);
    expect(lastAudit.details).not.toContain("SecurePassword123!"); // never logs passwords
  });

  test("PROV-02: Non-admin callers (students, existing counsellors, unauthenticated) are rejected", async () => {
    const { t, asStudent, asCounsellor } = await setup();

    const payload = {
      name: "Attacker Fake",
      mobile_number: "9876543211",
      password: "Password123",
      email: "attacker@campus.edu",
    };

    // Student rejected
    await expect(asStudent.mutation(api.counsellorDirectory.provisionCounsellor, payload)).rejects.toThrow(
      /Unauthorized/
    );

    // Counsellor rejected
    await expect(asCounsellor.mutation(api.counsellorDirectory.provisionCounsellor, payload)).rejects.toThrow(
      /Unauthorized/
    );

    // Unauthenticated rejected
    await expect(t.mutation(api.counsellorDirectory.provisionCounsellor, payload)).rejects.toThrow(
      /Unauthenticated|Unauthorized/
    );
  });

  test("PROV-03: Duplicate mobile number is rejected and creates no duplicate records", async () => {
    const { t, asAdmin } = await setup();

    // First creation
    await asAdmin.mutation(api.counsellorDirectory.provisionCounsellor, {
      name: "Dr. First",
      mobile_number: "9876543220",
      password: "Password123",
      email: "first@campus.edu",
    });

    const userCountBefore = (await t.run(async (ctx) => ctx.db.query("users").collect())).length;
    const entryCountBefore = (await t.run(async (ctx) => ctx.db.query("counsellors").collect())).length;

    // Retry / double-submission with same mobile number
    await expect(
      asAdmin.mutation(api.counsellorDirectory.provisionCounsellor, {
        name: "Dr. Duplicate",
        mobile_number: "9876543220",
        password: "Password123",
        email: "duplicate@campus.edu",
      })
    ).rejects.toThrow(/already registered/);

    const userCountAfter = (await t.run(async (ctx) => ctx.db.query("users").collect())).length;
    const entryCountAfter = (await t.run(async (ctx) => ctx.db.query("counsellors").collect())).length;

    // No orphaned or duplicate records created
    expect(userCountAfter).toBe(userCountBefore);
    expect(entryCountAfter).toBe(entryCountBefore);
  });

  test("PROV-04: Invalid inputs (short password, invalid mobile, invalid email, capacity > 20) are rejected atomically", async () => {
    const { asAdmin } = await setup();

    // Short password
    await expect(
      asAdmin.mutation(api.counsellorDirectory.provisionCounsellor, {
        name: "Dr. Test",
        mobile_number: "9876543231",
        password: "123",
        email: "test@campus.edu",
      })
    ).rejects.toThrow(/at least 6 characters/);

    // Invalid mobile
    await expect(
      asAdmin.mutation(api.counsellorDirectory.provisionCounsellor, {
        name: "Dr. Test",
        mobile_number: "12345",
        password: "Password123",
        email: "test@campus.edu",
      })
    ).rejects.toThrow(/10-digit mobile number/);

    // Invalid email
    await expect(
      asAdmin.mutation(api.counsellorDirectory.provisionCounsellor, {
        name: "Dr. Test",
        mobile_number: "9876543232",
        password: "Password123",
        email: "not-an-email",
      })
    ).rejects.toThrow(/valid institutional email/);

    // Capacity > 20
    await expect(
      asAdmin.mutation(api.counsellorDirectory.provisionCounsellor, {
        name: "Dr. Test",
        mobile_number: "9876543233",
        password: "Password123",
        email: "test@campus.edu",
        maxWorkload: 25,
      })
    ).rejects.toThrow(/between 1 and 20/);
  });

  test("PROV-05: Provisioned counsellor can immediately sign in with mobile number and password", async () => {
    const { t, asAdmin } = await setup();

    await asAdmin.mutation(api.counsellorDirectory.provisionCounsellor, {
      name: "Dr. Login Test",
      mobile_number: "9876543299",
      password: "TestPassword456!",
      email: "logintest@campus.edu",
    });

    // Login via users.login
    const loginResult = await t.mutation(api.users.login, {
      mobile_number: "9876543299",
      password: "TestPassword456!",
    });

    expect(loginResult).toBeDefined();
    expect(loginResult.token).toBeDefined();
    expect(loginResult.user!.role).toBe("counsellor");
    expect(loginResult.user!.full_name).toBe("Dr. Login Test");

    // Wrong password returns error
    const failedLogin: any = await t.mutation(api.users.login, {
      mobile_number: "9876543299",
      password: "WrongPassword!",
    });
    expect(failedLogin.error).toMatch(/Invalid mobile number or password/);
  });
});

describe("Counsellor directory status query (Unlinked onboarding banner)", () => {
  test("STATUS-01: Returns isLinked: false for counsellor without a directory entry", async () => {
    const { asCounsellor } = await setup();

    const status = await asCounsellor.query(api.counsellorDirectory.getMyDirectoryStatus, {});
    expect(status.isCounsellor).toBe(true);
    expect(status.isLinked).toBe(false);
    expect(status.entry).toBeNull();
  });

  test("STATUS-02: Returns isLinked: true after directory linkage is established", async () => {
    const { asAdmin, asCounsellor, counsellor } = await setup();

    // Admin creates directory entry and links it
    const entryId = await asAdmin.mutation(api.dashboard.addCounsellor, {
      name: "Counsellor Existing",
      email: "counsellor@campus.edu",
      phone: "+91 90000 00088",
      role: "counsellor",
      availability: [],
      maxWorkload: 15,
      userId: counsellor,
    });

    const status = await asCounsellor.query(api.counsellorDirectory.getMyDirectoryStatus, {});
    expect(status.isCounsellor).toBe(true);
    expect(status.isLinked).toBe(true);
    expect(status.entry?._id).toEqual(entryId);
  });

  test("STATUS-03: Returns isCounsellor: false for admin and student accounts", async () => {
    const { asAdmin, asStudent } = await setup();

    const adminStatus = await asAdmin.query(api.counsellorDirectory.getMyDirectoryStatus, {});
    expect(adminStatus.isCounsellor).toBe(false);
    expect(adminStatus.isLinked).toBe(false);

    const studentStatus = await asStudent.query(api.counsellorDirectory.getMyDirectoryStatus, {});
    expect(studentStatus.isCounsellor).toBe(false);
    expect(studentStatus.isLinked).toBe(false);
  });
});
