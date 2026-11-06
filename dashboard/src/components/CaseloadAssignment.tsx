import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { UserCog } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDashboardAuth } from "./AuthContext";

/**
 * Shows which counsellor is responsible for a student. Admins can assign, reassign or
 * unassign; counsellors only see the current assignment.
 */
export default function CaseloadAssignment({ studentId }: { studentId: Id<"users"> }) {
  const { isAdmin } = useDashboardAuth();
  const assignment = useQuery(api.counsellorAssignments.getForStudent, { studentId });
  const counsellors = useQuery(api.counsellorAssignments.listCounsellorUsers, isAdmin ? {} : "skip");
  const assign = useMutation(api.counsellorAssignments.assign);
  const unassign = useMutation(api.counsellorAssignments.unassign);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentId = assignment?.counsellorId ? String(assignment.counsellorId) : "";

  const handleChange = async (value: string) => {
    if (value === currentId) return;
    // Reassigning or removing takes access away from the current counsellor: confirm first.
    if (currentId) {
      const next = (counsellors || []).find((c) => String(c._id) === value);
      const message = value
        ? `Reassign this student from ${assignment?.counsellorName} to ${next?.full_name ?? "the selected counsellor"}? ${assignment?.counsellorName} will lose access to their records. No history is deleted.`
        : `Remove ${assignment?.counsellorName} as this student's counsellor? No counsellor will be able to open their records until they are assigned again.`;
      if (!window.confirm(message)) return;
    }
    setSaving(true);
    setError("");
    try {
      if (value) {
        await assign({ studentId, counsellorId: value as Id<"users"> });
      } else {
        await unassign({ studentId });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the assignment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
      <UserCog size={16} aria-hidden="true" />
      <span style={{ fontWeight: 600 }}>Assigned counsellor:</span>
      {isAdmin ? (
        <select
          aria-label="Assigned counsellor"
          value={currentId}
          disabled={saving || assignment === undefined || counsellors === undefined}
          onChange={(e) => handleChange(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--input-border)", background: "#ffffff", color: "var(--text-primary)", fontSize: "0.85rem" }}
        >
          <option value="">Unassigned (all counsellors are alerted)</option>
          {assignment && !assignment.counsellorActive && (
            <option value={currentId} disabled>{assignment.counsellorName} (inactive)</option>
          )}
          {(counsellors || []).map((c) => (
            <option key={c._id} value={String(c._id)}>
              {c.full_name} · {c.caseloadSize} student{c.caseloadSize === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      ) : (
        <span style={{ color: "var(--text-primary)" }}>
          {assignment === undefined ? "…" : assignment ? assignment.counsellorName : "Unassigned"}
        </span>
      )}
      {assignment && !assignment.counsellorActive && (
        <span className="badge badge-orange">{isAdmin ? "Counsellor account inactive · choose a new counsellor" : "Counsellor account inactive"}</span>
      )}
      {isAdmin && counsellors && counsellors.length === 0 && (
        <span>No counsellor accounts yet. Create one from Students → Add User.</span>
      )}
      {error && <span role="alert" style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
