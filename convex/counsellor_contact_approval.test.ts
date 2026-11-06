import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ZERO_PQ16 = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i + 1), 0]));
const FLAGGED = {
  phq9: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 1 },
  gad7: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
  pq16: ZERO_PQ16,
};

const INSTITUTION_EMAIL = "counselling.asha@college.edu";
const INSTITUTION_PHONE = "+91 44 2345 6789";
const LOGIN_MOBILE = "9000000001";
const ACCOUNT_EMAIL = "asha.private@example.com";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (doc: any) => ctx.db.insert("users", { status: "active", created_at: Date.now(), ...doc });
    return {
      admin: await user({ full_name: "Admin Ada", role: "admin" }),
      counsellorA: await user({ full_name: "Counsellor Asha", role: "counsellor", mobile_number: LOGIN_MOBILE, email: ACCOUNT_EMAIL, campus: "North", age: 41 }),
      counsellorB: await user({ full_name: "Counsellor Bala", role: "counsellor", mobile_number: "9000000002" }),
      inactiveCounsellor: await user({ full_name: "Counsellor Former", role: "counsellor", status: "inactive" }),
      s1: await user({ full_name: "Student One", role: "patient", patientId: "101", mobile_number: "8000000001" }),
      s2: await user({ full_name: "Student Two", role: "patient", patientId: "102", mobile_number: "8000000002" }),
    };
  });
  const as = (id: string) => t.withIdentity({ subject: id });
  const asAdmin = as(ids.admin);
  // Directory entry created through the admin API, then linked and assigned
  const entryId: any = await asAdmin.mutation(api.dashboard.addCounsellor, {
    name: "Counsellor Asha", email: INSTITUTION_EMAIL, phone: INSTITUTION_PHONE, role: "counsellor", availability: [], maxWorkload: 20,
  });
  await asAdmin.mutation(api.counsellorDirectory.linkAccount, { entryId, userId: ids.counsellorA as any });
  await asAdmin.mutation(api.counsellorAssignments.assign, { studentId: ids.s1 as any, counsellorId: ids.counsellorA as any });
  const mine = async (student = ids.s1) => ((await as(student).query(api.counsellorAssignments.getMyCounsellor, {})) as any).counsellor;
  const setVisible = (field: "email" | "phone", visible: boolean) =>
    asAdmin.mutation(api.counsellorDirectory.setContactVisibility, { entryId, field, visible });
  return { t, ...ids, as, asAdmin, entryId, mine, setVisible };
}

describe("student visibility of counsellor contact details", () => {
  test("both fields are unapproved by default, for new entries created by admins", async () => {
    const { t, entryId, mine } = await setup();
    const entry: any = await t.run(async (ctx) => ctx.db.get(entryId));
    expect(entry).toMatchObject({ shareEmailWithStudents: false, sharePhoneWithStudents: false });
    expect(await mine()).toMatchObject({ email: null, phone: null });
  });

  test("email approved while phone stays hidden", async () => {
    const { mine, setVisible } = await setup();
    await setVisible("email", true);
    expect(await mine()).toMatchObject({ email: INSTITUTION_EMAIL, phone: null });
  });

  test("phone approved while email stays hidden", async () => {
    const { mine, setVisible } = await setup();
    await setVisible("phone", true);
    expect(await mine()).toMatchObject({ email: null, phone: INSTITUTION_PHONE });
  });

  test("both fields approved", async () => {
    const { mine, setVisible } = await setup();
    await setVisible("email", true);
    await setVisible("phone", true);
    expect(await mine()).toEqual({ displayName: "Counsellor Asha", role: "Counsellor", email: INSTITUTION_EMAIL, phone: INSTITUTION_PHONE });
  });

  test("revoking an approval removes the field from the very next response", async () => {
    const { mine, setVisible } = await setup();
    await setVisible("email", true);
    await setVisible("phone", true);
    await setVisible("email", false);
    expect(await mine()).toMatchObject({ email: null, phone: INSTITUTION_PHONE });
    await setVisible("phone", false);
    expect(await mine()).toMatchObject({ email: null, phone: null });
  });

  test("legacy entries without approval fields are treated as unapproved", async () => {
    const { t, counsellorB, s2, asAdmin, mine } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("counsellors", {
        userId: counsellorB as any, name: "Counsellor Bala", email: "bala@college.edu", phone: "0441111111",
        role: "counsellor", availability: [], maxWorkload: 20, rating: 5, status: "active", createdAt: 1,
      });
    });
    await asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s2 as any, counsellorId: counsellorB as any });
    expect(await mine(s2)).toMatchObject({ email: null, phone: null });
    const rows: any[] = await asAdmin.query(api.counsellorDirectory.listForAdmin, {});
    expect(rows.find((r) => r.name === "Counsellor Bala")).toMatchObject({ shareEmailWithStudents: false, sharePhoneWithStudents: false, studentVisible: { email: null, phone: null } });
  });

  test("changing a stored value clears that field's approval; the other field keeps its approval", async () => {
    const { mine, setVisible, asAdmin, entryId } = await setup();
    await setVisible("email", true);
    await setVisible("phone", true);
    const res: any = await asAdmin.mutation(api.counsellorDirectory.updateContact, { entryId, email: "new.desk@college.edu", phone: INSTITUTION_PHONE });
    expect(res.approvalsCleared).toEqual({ email: true, phone: false });
    expect(await mine()).toMatchObject({ email: null, phone: INSTITUTION_PHONE });
  });

  test("relinking to another account clears approvals; an inactive or duplicate directory entry shares nothing", async () => {
    const { t, asAdmin, entryId, mine, setVisible, counsellorA } = await setup();
    await setVisible("email", true);
    await asAdmin.mutation(api.counsellorDirectory.unlinkAccount, { entryId });
    expect(await mine()).toMatchObject({ email: null, phone: null });
    await asAdmin.mutation(api.counsellorDirectory.linkAccount, { entryId, userId: counsellorA as any });
    expect(await mine()).toMatchObject({ email: null }); // approval did not survive the relink

    await setVisible("email", true);
    await asAdmin.mutation(api.dashboard.updateCounsellorStatus, { counsellorId: entryId, status: "inactive" });
    expect(await mine()).toMatchObject({ email: null });
    await asAdmin.mutation(api.dashboard.updateCounsellorStatus, { counsellorId: entryId, status: "active" });
    expect(await mine()).toMatchObject({ email: INSTITUTION_EMAIL });

    // Legacy duplicate link (bypassing the API): ambiguous, so nothing is shared
    await t.run(async (ctx) => {
      await ctx.db.insert("counsellors", {
        userId: counsellorA as any, name: "Duplicate", email: "other@college.edu", phone: "0442222222", role: "counsellor",
        availability: [], maxWorkload: 1, rating: 5, status: "active", createdAt: 2, shareEmailWithStudents: true, sharePhoneWithStudents: true,
      });
    });
    expect(await mine()).toMatchObject({ email: null, phone: null });
  });

  test("approval requires a linked account and a stored value", async () => {
    const { asAdmin } = await setup();
    const unlinked: any = await asAdmin.mutation(api.dashboard.addCounsellor, { name: "Desk", email: "desk@college.edu", phone: "", role: "counsellor", availability: [], maxWorkload: 1 });
    await expect(asAdmin.mutation(api.counsellorDirectory.setContactVisibility, { entryId: unlinked, field: "email", visible: true })).rejects.toThrow(/Link this entry/);
  });

  test("login identifiers, account email, private profile fields and internal ids never reach the student", async () => {
    const { mine, setVisible, counsellorA, entryId, as, s1 } = await setup();
    await setVisible("email", true);
    await setVisible("phone", true);
    const response: any = await as(s1).query(api.counsellorAssignments.getMyCounsellor, {});
    const full = JSON.stringify(response);
    for (const secret of [LOGIN_MOBILE, ACCOUNT_EMAIL, counsellorA, String(entryId), "North", "8000000001", "Student"]) {
      expect(full, secret).not.toContain(secret);
    }
    // Numeric profile fields are checked on the counsellor object only: the assignment
    // timestamp elsewhere in the response can contain any digits.
    expect(JSON.stringify(response.counsellor)).not.toContain("41");
    expect(Object.keys(await mine()).sort()).toEqual(["displayName", "email", "phone", "role"]);
  });
});

describe("only admins manage the directory", () => {
  test("counsellors, students and anonymous callers cannot link, edit or approve", async () => {
    const { t, as, counsellorA, counsellorB, s1, entryId } = await setup();
    for (const caller of [as(counsellorA), as(counsellorB), as(s1), t]) {
      await expect(caller.mutation(api.counsellorDirectory.setContactVisibility, { entryId, field: "email", visible: true })).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.mutation(api.counsellorDirectory.updateContact, { entryId, email: "x@college.edu", phone: "0440000000" })).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.mutation(api.counsellorDirectory.unlinkAccount, { entryId })).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.mutation(api.counsellorDirectory.linkAccount, { entryId, userId: counsellorB as any })).rejects.toThrow(/Unauthorized|Unauthenticated/);
      await expect(caller.query(api.counsellorDirectory.listForAdmin, {})).rejects.toThrow(/Unauthorized|Unauthenticated/);
    }
    const entry: any = await t.run(async (ctx) => ctx.db.get(entryId));
    expect(entry).toMatchObject({ userId: counsellorA, shareEmailWithStudents: false, email: INSTITUTION_EMAIL });
  });

  test("students cannot read the staff directory", async () => {
    const { as, s1 } = await setup();
    expect(await as(s1).query(api.dashboard.getCounsellors, {})).toEqual([]);
  });

  test("invalid and duplicate directory-to-account links are rejected", async () => {
    const { asAdmin, entryId, admin, s1, counsellorA, counsellorB } = await setup();
    const second: any = await asAdmin.mutation(api.dashboard.addCounsellor, { name: "Second", email: "s@college.edu", phone: "0443333333", role: "counsellor", availability: [], maxWorkload: 1 });
    await expect(asAdmin.mutation(api.counsellorDirectory.linkAccount, { entryId: second, userId: s1 as any })).rejects.toThrow("Counsellor account not found.");
    await expect(asAdmin.mutation(api.counsellorDirectory.linkAccount, { entryId: second, userId: admin as any })).rejects.toThrow("Counsellor account not found.");
    await expect(asAdmin.mutation(api.counsellorDirectory.linkAccount, { entryId: second, userId: counsellorA as any })).rejects.toThrow(/already linked to another directory entry/);
    await expect(asAdmin.mutation(api.dashboard.addCounsellor, { name: "Third", email: "t@college.edu", phone: "0444444444", role: "counsellor", availability: [], maxWorkload: 1, userId: counsellorA as any })).rejects.toThrow(/already linked/);
    // Relinking an already-linked entry needs an explicit unlink first
    await expect(asAdmin.mutation(api.counsellorDirectory.linkAccount, { entryId, userId: counsellorB as any })).rejects.toThrow(/Unlink it first/);
    // Malformed contact values are rejected
    await expect(asAdmin.mutation(api.counsellorDirectory.updateContact, { entryId, email: "not-an-email", phone: INSTITUTION_PHONE })).rejects.toThrow(/valid institutional email/);
    await expect(asAdmin.mutation(api.counsellorDirectory.updateContact, { entryId, email: INSTITUTION_EMAIL, phone: "abc" })).rejects.toThrow(/valid institutional phone/);
    await expect(asAdmin.mutation(api.dashboard.addCounsellor, { name: "Bad", email: "nope", phone: "", role: "counsellor", availability: [], maxWorkload: 1 })).rejects.toThrow(/valid institutional email/);
  });

  test("approval changes are audited", async () => {
    const { t, setVisible } = await setup();
    await setVisible("phone", true);
    await setVisible("phone", false);
    const actions = (await t.run(async (ctx) => ctx.db.query("auditLogs").collect())).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["counsellor_directory_linked", "counsellor_contact_approved", "counsellor_contact_revoked"]));
  });
});

describe("student assignment isolation", () => {
  test("a student only ever receives their own counsellor", async () => {
    const { asAdmin, s2, counsellorB, mine, setVisible, as, s1 } = await setup();
    await setVisible("email", true);
    await asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s2 as any, counsellorId: counsellorB as any });
    expect(await mine(s2)).toEqual({ displayName: "Counsellor Bala", role: "Counsellor", email: null, phone: null });
    expect((await mine(s1)).displayName).toBe("Counsellor Asha");
    await expect(as(s2).query(api.counsellorAssignments.getForStudent, { studentId: s1 as any })).rejects.toThrow(/Unauthorized/);
  });
});

describe("safety-alert recipients (policy unchanged)", () => {
  const criticalRecipients = async (t: any) =>
    (await t.run(async (ctx: any) => ctx.db.query("notifications").collect())).filter((n: any) => n.type === "critical_risk").map((n: any) => n.recipientId);

  test("unassigned student: every ACTIVE counsellor and every admin is notified; inactive counsellors are not", async () => {
    const { t, as, s2, admin, counsellorA, counsellorB, inactiveCounsellor } = await setup();
    await as(s2).mutation(api.screening.submitScreeningAttempt, { responses: FLAGGED });
    const recipients = await criticalRecipients(t);
    expect(recipients.sort()).toEqual([admin, counsellorA, counsellorB].sort());
    expect(recipients).not.toContain(inactiveCounsellor);
  });

  test("assigned student: the assigned counsellor and admins are notified", async () => {
    const { t, as, s1, admin, counsellorA } = await setup();
    await as(s1).mutation(api.screening.submitScreeningAttempt, { responses: FLAGGED });
    expect((await criticalRecipients(t)).sort()).toEqual([admin, counsellorA].sort());
  });

  test("being notified about an unassigned student grants no access to their records", async () => {
    const { t, as, s2, counsellorB } = await setup();
    await as(s2).mutation(api.screening.submitScreeningAttempt, { responses: FLAGGED });
    expect(await criticalRecipients(t)).toContain(counsellorB);
    const alert: any = (await t.run(async (ctx) => ctx.db.query("alerts").collect())).find((a) => a.userId === s2);
    await expect(as(counsellorB).query(api.screening.getAll, { userId: s2 })).rejects.toThrow(/not in your caseload/);
    await expect(as(counsellorB).query(api.alerts.getAlertProvenance, { alertId: alert._id })).rejects.toThrow(/not in your caseload|Unauthorized/);
    await expect(as(counsellorB).mutation(api.alerts.acknowledgeAlert, { alertId: alert._id })).rejects.toThrow(/not in your caseload|Unauthorized/);
    expect((await as(counsellorB).query(api.dashboard.getAlerts, {})) as any[]).toEqual([]);
  });

  test("reassignment keeps alert history and provenance unchanged", async () => {
    const { t, as, s1, asAdmin, counsellorB } = await setup();
    await as(s1).mutation(api.screening.submitScreeningAttempt, { responses: FLAGGED });
    const snapshot = () => t.run(async (ctx) => ({ alerts: await ctx.db.query("alerts").collect(), triages: await ctx.db.query("triages").collect(), attempts: await ctx.db.query("screeningAttempts").collect() }));
    const before = await snapshot();
    await asAdmin.mutation(api.counsellorAssignments.assign, { studentId: s1 as any, counsellorId: counsellorB as any });
    expect(await snapshot()).toEqual(before);
  });
});
