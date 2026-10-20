import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, Search, UserCheck, UserMinus, UserX, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LoadingState } from "../components/UIComponents";

/** Same cap as counsellorAssignments.MAX_BULK_ASSIGNMENTS on the server. */
const MAX_BULK = 100;

type StatusFilter = "all" | "assigned" | "unassigned";
type Feedback = { kind: "success" | "partial" | "error"; message: string; details?: string[] };
type PendingAction =
  | { kind: "assign"; counsellorId: Id<"users">; counsellorName: string; reassigning: number }
  | { kind: "unassign"; count: number };

const cell: React.CSSProperties = { padding: "12px 16px", borderBottom: "1px solid var(--border-color)", fontSize: "0.88rem", verticalAlign: "middle" };
const head: React.CSSProperties = { ...cell, background: "#f8fafc", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", textAlign: "left" };

function Metric({ label, value, note, tone }: { label: string; value: number | string; note: string; tone?: "warn" }) {
  return (
    <article className="glass-panel" style={{ padding: "16px 20px" }}>
      <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: "1.9rem", fontWeight: 700, color: tone === "warn" ? "var(--danger)" : "var(--text-primary)", margin: "4px 0" }}>{value}</p>
      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{note}</p>
    </article>
  );
}

/**
 * Admin: assign, reassign and remove counsellor caseload assignments, singly or in bulk.
 * All rules (one active counsellor per student, admin-only, validation) are enforced by the
 * counsellorAssignments mutations; this page only collects the choice and reports outcomes.
 */
export default function Assignments() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [counsellorFilter, setCounsellorFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Changing what is listed clears the selection, so a bulk action only ever applies to visible rows.
  const updateFilter = <T,>(set: (v: T) => void) => (value: T) => {
    set(value);
    setSelected(new Set());
  };
  const onSearch = updateFilter(setSearch);
  const onStatus = updateFilter(setStatus);
  const onCounsellorFilter = updateFilter(setCounsellorFilter);

  const roster = useQuery(api.counsellorAssignments.listStudentAssignments, {
    search: search.trim() || undefined,
    status,
    counsellorId: counsellorFilter ? (counsellorFilter as Id<"users">) : undefined,
  });
  const counsellors = useQuery(api.counsellorAssignments.listCounsellorUsers, { includeInactive: true });
  const exceptions = useQuery(api.counsellorAssignments.getAdminExceptions, {});
  const assignMany = useMutation(api.counsellorAssignments.assignMany);
  const unassignMany = useMutation(api.counsellorAssignments.unassignMany);

  const activeCounsellors = useMemo(() => (counsellors || []).filter((c) => c.status === "active"), [counsellors]);
  const rows = useMemo(() => roster?.rows ?? [], [roster]);
  const nameById = useMemo(() => new Map(rows.map((r) => [String(r.studentId), `${r.name}${r.patientId ? ` (#${r.patientId})` : ""}`])), [rows]);
  const selectedRows = rows.filter((r) => selected.has(String(r.studentId)));
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(String(r.studentId)));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(rows.map((r) => String(r.studentId))));

  const requestAssign = () => {
    const counsellor = activeCounsellors.find((c) => String(c._id) === target);
    if (!counsellor || selected.size === 0) return;
    const reassigning = selectedRows.filter((r) => r.counsellor && String(r.counsellor.counsellorId) !== target).length;
    setPending({ kind: "assign", counsellorId: counsellor._id, counsellorName: counsellor.full_name, reassigning });
  };

  const confirm = async () => {
    if (!pending) return;
    setSaving(true);
    setFeedback(null);
    const studentIds = Array.from(selected) as Id<"users">[];
    try {
      if (pending.kind === "assign") {
        const res = await assignMany({ studentIds, counsellorId: pending.counsellorId });
        const { assigned, reassigned, unchanged, failed } = res.summary;
        const parts = [assigned && `${assigned} assigned`, reassigned && `${reassigned} reassigned`, unchanged && `${unchanged} already with ${pending.counsellorName}`].filter(Boolean);
        const failures = res.results.filter((r) => r.outcome === "failed").map((r) => `${nameById.get(String(r.studentId)) ?? "Student"}: ${r.error}`);
        setFeedback({
          kind: failed === 0 ? "success" : parts.length > 0 ? "partial" : "error",
          message: failed === 0 ? `${parts.join(", ")} to ${pending.counsellorName}.` : `${failed} of ${studentIds.length} could not be assigned${parts.length ? `; ${parts.join(", ")}` : ""}.`,
          details: failures,
        });
        // Keep only the failed students selected so they can be fixed and retried
        setSelected(new Set(res.results.filter((r) => r.outcome === "failed").map((r) => String(r.studentId))));
      } else {
        const res = await unassignMany({ studentIds });
        setFeedback({ kind: "success", message: `${res.summary.unassigned} assignment${res.summary.unassigned === 1 ? "" : "s"} removed${res.summary.unchanged ? `; ${res.summary.unchanged} already unassigned` : ""}.` });
        setSelected(new Set());
      }
    } catch (e) {
      setFeedback({ kind: "error", message: e instanceof Error ? e.message : "The change could not be saved. Nothing was changed." });
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  if (roster === undefined || counsellors === undefined) return <LoadingState message="Loading assignments…" />;
  const { summary } = roster;
  const overLimit = selected.size > MAX_BULK;

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: "2rem", marginBottom: 6, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>Student assignments</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
          Each student has one primary counsellor. Counsellors can open records only for students assigned to them. Reassigning keeps all history; it only changes who has access.
        </p>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }} aria-label="Assignment totals">
        <Metric label="Students" value={summary.totalStudents} note={roster.truncated ? "Newest 2,000 accounts shown" : "Registered accounts"} />
        <Metric label="Assigned" value={summary.assigned} note="Have a primary counsellor" />
        <Metric label="Unassigned" value={summary.unassigned} note="Not visible to any counsellor" tone={summary.unassigned > 0 ? "warn" : undefined} />
        <Metric label="Needs reassignment" value={summary.assignedToInactiveCounsellor} note="Counsellor account deactivated" tone={summary.assignedToInactiveCounsellor > 0 ? "warn" : undefined} />
      </section>

      {exceptions && <ExceptionsPanel exceptions={exceptions} />}

      <section className="glass-panel" style={{ padding: 0, overflow: "hidden" }} aria-labelledby="counsellors-title">
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)" }}>
          <h2 id="counsellors-title" style={{ fontSize: "1.05rem", color: "var(--text-primary)" }}>Counsellors</h2>
          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Choose “View caseload” to list a counsellor’s students below.</p>
        </div>
        {counsellors.length === 0 ? (
          <p style={{ padding: 20, color: "var(--text-secondary)" }}>No counsellor accounts yet. Create one from Students → Add User with the Counsellor role.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={head}>Counsellor</th>
                <th style={head}>Contact</th>
                <th style={head}>Students</th>
                <th style={head}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {counsellors.map((c) => (
                <tr key={c._id}>
                  <td style={cell}>
                    <strong>{c.full_name}</strong>
                    {c.status === "inactive" && <span className="badge badge-red" style={{ marginLeft: 8 }}>Inactive</span>}
                  </td>
                  <td style={{ ...cell, color: "var(--text-secondary)" }}>{[c.email, c.mobile_number].filter(Boolean).join(" · ") || "—"}</td>
                  <td style={cell}>
                    {c.caseloadSize === 0 ? <span className="badge badge-yellow">No students</span> : `${c.caseloadSize} / ${c.capacity}`}
                    {c.capacityState === "full" && <span className="badge badge-red" style={{ marginLeft: 8 }}>Full</span>}
                    {c.capacityState === "near" && <span className="badge badge-yellow" style={{ marginLeft: 8 }}>Near capacity</span>}
                  </td>
                  <td style={{ ...cell, textAlign: "right" }}>
                    <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => { onCounsellorFilter(String(c._id)); setStatus("all"); }}>
                      View caseload
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="glass-panel" style={{ padding: 0, overflow: "hidden" }} aria-labelledby="roster-title">
        <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", borderBottom: "1px solid var(--border-color)" }}>
          <h2 id="roster-title" style={{ fontSize: "1.05rem", color: "var(--text-primary)", marginRight: "auto" }}>Students</h2>
          <div className="input-with-icon" style={{ minWidth: 240 }}>
            <Search size={16} className="input-icon" />
            <input type="text" aria-label="Search students" placeholder="Search name, student ID or mobile…" value={search} onChange={(e) => onSearch(e.target.value)} style={{ padding: "9px 12px 9px 38px", fontSize: "0.88rem" }} />
          </div>
          <select aria-label="Assignment status" value={status} onChange={(e) => onStatus(e.target.value as StatusFilter)} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid var(--input-border)" }}>
            <option value="all">All students</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <select aria-label="Filter by counsellor" value={counsellorFilter} onChange={(e) => onCounsellorFilter(e.target.value)} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid var(--input-border)" }}>
            <option value="">Any counsellor</option>
            {counsellors.map((c) => (
              <option key={c._id} value={String(c._id)}>{c.full_name}{c.status === "inactive" ? " (inactive)" : ""}</option>
            ))}
          </select>
        </div>

        <div style={{ padding: "12px 20px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: selected.size ? "rgba(37,99,235,0.05)" : "transparent", borderBottom: "1px solid var(--border-color)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{selected.size} selected</span>
          <select aria-label="Counsellor to assign" value={target} onChange={(e) => setTarget(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--input-border)" }}>
            <option value="">Choose a counsellor…</option>
            {activeCounsellors.map((c) => (
              <option key={c._id} value={String(c._id)} disabled={c.capacityState === "full"}>
                {c.full_name} · {c.caseloadSize}/{c.capacity}{c.capacityState === "full" ? " (full)" : c.capacityState === "near" ? " (near capacity)" : ""}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" disabled={saving || !target || selected.size === 0 || overLimit} onClick={requestAssign} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px" }}>
            <UserCheck size={15} /> Assign selected
          </button>
          <button className="btn btn-secondary" disabled={saving || selected.size === 0 || overLimit} onClick={() => setPending({ kind: "unassign", count: selected.size })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px" }}>
            <UserMinus size={15} /> Remove assignment
          </button>
          {selected.size > 0 && <button className="btn btn-secondary" style={{ padding: "8px 12px" }} onClick={() => setSelected(new Set())}>Clear selection</button>}
          {overLimit && <span role="alert" style={{ color: "var(--danger)", fontSize: "0.82rem" }}>Select at most {MAX_BULK} students at a time.</span>}
        </div>

        {feedback && (
          <div role={feedback.kind === "success" ? "status" : "alert"} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-color)", background: feedback.kind === "success" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.07)", fontSize: "0.86rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              {feedback.kind === "success" ? <CheckCircle2 size={16} color="#10b981" /> : <AlertTriangle size={16} color="#ef4444" />}
              {feedback.message}
            </div>
            {feedback.details && feedback.details.length > 0 && (
              <ul style={{ margin: "6px 0 0 24px" }}>{feedback.details.map((d) => <li key={d}>{d}</li>)}</ul>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
            <Users size={36} style={{ margin: "0 auto 10px", display: "block", color: "var(--border-color)" }} />
            {counsellorFilter ? "This counsellor has no assigned students." : status === "unassigned" ? "Every student has a counsellor." : "No students match these filters."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...head, width: 44 }}>
                  <input type="checkbox" aria-label="Select all students shown" checked={allVisibleSelected} onChange={toggleAll} />
                </th>
                <th style={head}>Student</th>
                <th style={head}>Current counsellor</th>
                <th style={head}>Assigned since</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = String(r.studentId);
                return (
                  <tr key={id} style={{ background: selected.has(id) ? "rgba(37,99,235,0.04)" : undefined }}>
                    <td style={cell}>
                      <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(id)} onChange={() => toggle(id)} />
                    </td>
                    <td style={cell}>
                      <Link to={`/patients/${id}`} style={{ fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</Link>
                      {r.patientId && <span style={{ marginLeft: 8, fontFamily: "monospace", fontSize: "0.75rem", color: "#4f46e5" }}>#{r.patientId}</span>}
                      {r.studentStatus === "inactive" && <span className="badge badge-red" style={{ marginLeft: 8 }}>Inactive account</span>}
                    </td>
                    <td style={cell}>
                      {!r.counsellor ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}><UserX size={14} /> Unassigned</span>
                      ) : (
                        <>
                          {r.counsellor.name}
                          {!r.counsellor.active && <span className="badge badge-orange" style={{ marginLeft: 8 }}>Counsellor inactive · reassign</span>}
                        </>
                      )}
                    </td>
                    <td style={{ ...cell, color: "var(--text-secondary)" }}>{r.counsellor ? new Date(r.counsellor.assignedAt).toLocaleDateString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {roster.matched > rows.length && (
          <p style={{ padding: "12px 20px", fontSize: "0.82rem", color: "var(--text-secondary)" }}>Showing the first {rows.length} of {roster.matched} matching students. Narrow the search to see the rest.</p>
        )}
      </section>

      {pending && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="glass-panel" style={{ background: "#fff", padding: 24, maxWidth: 460, width: "92%" }}>
            <h3 id="confirm-title" style={{ fontSize: "1.15rem", marginBottom: 10 }}>
              {pending.kind === "assign" ? `Assign ${selected.size} student${selected.size === 1 ? "" : "s"} to ${pending.counsellorName}?` : `Remove ${pending.count} assignment${pending.count === 1 ? "" : "s"}?`}
            </h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: 18 }}>
              {pending.kind === "assign"
                ? pending.reassigning > 0
                  ? `${pending.reassigning === selected.size ? (selected.size === 1 ? "This student currently has" : "All of them currently have") : `${pending.reassigning} of them currently ${pending.reassigning === 1 ? "has" : "have"}`} another counsellor, who will lose access to their records. Open alerts and follow-ups move to ${pending.counsellorName}. No history is deleted.`
                  : `${pending.counsellorName} will be able to open these students’ records, alerts and follow-ups.`
                : "These students will have no counsellor. No counsellor will be able to open their records until they are assigned again; safety alerts will still notify all counsellors and admins."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setPending(null)} disabled={saving}>Cancel</button>
              <button className={pending.kind === "unassign" || (pending.kind === "assign" && pending.reassigning > 0) ? "btn btn-danger" : "btn btn-primary"} onClick={confirm} disabled={saving}>
                {saving ? "Saving…" : pending.kind === "assign" ? (pending.reassigning > 0 ? "Reassign" : "Assign") : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Items that need an administrator: one line each, only when non-zero. */
function ExceptionsPanel({ exceptions }: { exceptions: any }) {
  const items: Array<{ label: string; detail?: string; to?: string }> = [];
  if (exceptions.unassignedStudents.count > 0) items.push({ label: `${exceptions.unassignedStudents.count} student${exceptions.unassignedStudents.count === 1 ? "" : "s"} without a counsellor` });
  if (exceptions.studentsWithInactiveCounsellor.count > 0) items.push({ label: `${exceptions.studentsWithInactiveCounsellor.count} student${exceptions.studentsWithInactiveCounsellor.count === 1 ? "" : "s"} assigned to a deactivated counsellor`, detail: "Reassign them so a counsellor can open their records." });
  for (const c of exceptions.counsellorsAtOrNearCapacity) {
    items.push({ label: `${c.name}: ${c.caseloadSize}/${exceptions.capacity} students`, detail: c.state === "full" ? "Caseload full: new assignments are refused." : "Approaching the caseload limit." });
  }
  if (exceptions.openAppointmentsWithoutCounsellor.count > 0) items.push({ label: `${exceptions.openAppointmentsWithoutCounsellor.count} open appointment${exceptions.openAppointmentsWithoutCounsellor.count === 1 ? "" : "s"} without a counsellor`, detail: "Assign the student to a counsellor, or answer from Sessions.", to: "/sessions" });
  if (exceptions.undeliveredSafetyAlerts > 0) items.push({ label: `${exceptions.undeliveredSafetyAlerts} safety alert${exceptions.undeliveredSafetyAlerts === 1 ? "" : "s"} reached no staff member`, detail: "Review them in the Alerts centre.", to: "/alerts" });
  for (const f of exceptions.recentAssignmentFailures.slice(0, 5)) {
    items.push({ label: `Assignment failed (${new Date(f.at).toLocaleString()})`, detail: f.error });
  }
  if (items.length === 0) return null;
  return (
    <section className="glass-panel" style={{ padding: "16px 20px", borderLeft: "4px solid #d97706" }} aria-labelledby="exceptions-title">
      <h2 id="exceptions-title" style={{ fontSize: "1.05rem", color: "var(--text-primary)", marginBottom: 8 }}>Needs attention</h2>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>
            {item.to ? <a href={item.to}>{item.label}</a> : item.label}
            {item.detail && <span style={{ color: "var(--text-secondary)" }}> — {item.detail}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
