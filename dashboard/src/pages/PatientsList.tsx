import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Users, UserPlus, Search, Edit2, ShieldAlert, ShieldCheck,
  BarChart2, Trash2, KeyRound, Copy, CheckCheck, Phone, Mail,
  UserCheck, UserX
} from "lucide-react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigate } from "react-router-dom";
import AddUserModal from "../components/AddUserModal";
import EditUserModal from "../components/EditUserModal";

/* ─── Tiny helpers ────────────────────────────────────────────── */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const hue = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: `linear-gradient(135deg, hsl(${hue},60%,55%), hsl(${(hue + 40) % 360},65%,60%))`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontWeight: 700,
        fontSize: "0.85rem",
        color: "#fff",
        letterSpacing: "0.04em",
        boxShadow: `0 4px 12px hsl(${hue},50%,55%,0.28)`,
      }}
    >
      {initials}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = (status || "active") === "active";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 20,
        fontSize: "0.71rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        background: active ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
        color: active ? "#10b981" : "#ef4444",
        border: `1px solid ${active ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "currentColor",
          display: "inline-block",
        }}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

type ActionColor = "blue" | "amber" | "red" | "orange" | "green" | "default";

function actionBtnStyle(color: ActionColor): React.CSSProperties {
  const map: Record<ActionColor, { bg: string; border: string; text: string }> = {
    blue:    { bg: "rgba(37,99,235,0.07)",   border: "rgba(37,99,235,0.2)",   text: "#2563eb" },
    amber:   { bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)", text: "#d97706" },
    red:     { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.22)",  text: "#ef4444" },
    orange:  { bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.22)", text: "#ea580c" },
    green:   { bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.22)", text: "#10b981" },
    default: { bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.2)", text: "var(--text-secondary)" },
  };
  const c = map[color];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 11px",
    borderRadius: 8,
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
    border: `1px solid ${c.border}`,
    background: c.bg,
    color: c.text,
    transition: "all 0.18s",
    whiteSpace: "nowrap" as const,
  };
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(15,23,42,0.4)",
  backdropFilter: "blur(14px)",
  zIndex: 99999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const credLabelStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 700,
};

function CredField({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div>
      <span style={credLabelStyle}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
        <code
          style={{
            flex: 1,
            fontFamily: "monospace",
            background: "var(--surface-base)",
            border: "1px solid var(--border-color)",
            padding: "7px 12px",
            borderRadius: 8,
            fontSize: "0.95rem",
            color: "var(--accent-primary)",
            fontWeight: 600,
          }}
        >
          {value}
        </code>
        {onCopy && (
          <button onClick={onCopy} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 5 }}>
            <Copy size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
/* â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function PatientsList() {
  const navigate = useNavigate();
  const convex = useConvex();
  const [searchTerm, setSearchTerm] = useState("");
  const page1 = useQuery(api.users.listPatients, { search: searchTerm || undefined, paginate: true });
  const [extraPatients, setExtraPatients] = useState<any[]>([]);
  const [nextCursorState, setNextCursorState] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  // Reset pagination state when search term changes
  const [lastSearch, setLastSearch] = useState("");
  if (searchTerm !== lastSearch) {
    setLastSearch(searchTerm);
    setExtraPatients([]);
    setNextCursorState(undefined);
  }

  const effectiveCursor = nextCursorState !== undefined ? nextCursorState : page1?.nextCursor ?? null;
  const hasMore = Boolean(effectiveCursor);

  const patients = useMemo(() => {
    if (!page1) return undefined;
    const base = page1.patients || [];
    const map = new Map<string, any>();
    for (const p of base) {
      map.set(p._id, p);
    }
    for (const p of extraPatients) {
      map.set(p._id, p);
    }
    return Array.from(map.values());
  }, [page1, extraPatients]);

  const handleLoadMore = async () => {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await convex.query(api.users.listPatients, {
        search: searchTerm || undefined,
        cursor: effectiveCursor,
        paginate: true,
      });
      if (res && res.patients) {
        setExtraPatients((prev) => [...prev, ...res.patients]);
        setNextCursorState(res.nextCursor);
      }
    } catch (err) {
      console.error("Failed to load more patients", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleStatus = useMutation(api.users.toggleUserStatus);
  const deleteUser = useMutation(api.users.deleteUser);
  const resetPassword = useMutation(api.users.resetPassword);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  const [resetResult, setResetResult] = useState<{
    userName: string;
    userId: string;
    mobile: string;
    newPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetLoading, setResetLoading] = useState<string | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    onConfirm: () => void;
  } | null>(null);

  const handleToggleStatus = (userId: any, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "inactive" : "active";
    setConfirmConfig({
      title: currentStatus === "active" ? "Deactivate User Access" : "Activate User Access",
      message: `Are you sure you want to set this user to ${nextStatus.toUpperCase()}? This will change their ability to log in.`,
      confirmText: currentStatus === "active" ? "Deactivate" : "Activate",
      isDanger: currentStatus === "active",
      onConfirm: async () => {
        try { await toggleStatus({ userId, status: nextStatus }); }
        catch (err: any) { alert(err.message || "Failed to update status."); }
      },
    });
  };

  const handleDeleteUser = (userId: any, fullName?: string) => {
    const name = fullName || "Unknown User";
    setConfirmConfig({
      title: "Delete User Profile?",
      message: `Permanently delete "${name}"? This will erase all clinical screenings, wellbeing check-ins, and sessions.`,
      confirmText: "Delete Permanently",
      isDanger: true,
      onConfirm: async () => {
        try { await deleteUser({ userId }); }
        catch (err: any) { alert(err.message || "Failed to delete user."); }
      },
    });
  };

  const handleResetPassword = (patient: any) => {
    setConfirmConfig({
      title: "Reset Password?",
      message: `Generate a new random password for "${patient.full_name}"? The old password stops working immediately.`,
      confirmText: "Reset Password",
      isDanger: true,
      onConfirm: async () => {
        setResetLoading(patient._id);
        try {
          const result = await resetPassword({ userId: patient._id });
          setResetResult({ userName: patient.full_name, userId: patient._id, mobile: patient.mobile_number, newPassword: result.newPassword });
          setCopied(false);
        } catch (err: any) {
          alert(err.message || "Failed to reset password.");
        } finally {
          setResetLoading(null);
        }
      },
    });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isLoading = patients === undefined;
  const isEmpty = !isLoading && (!patients || patients.length === 0);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: 6, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
            Students
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Manage access and view records for registered students.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 20px" }}>
          <UserPlus size={16} /> Add Student
        </button>
      </div>

      {showAddModal && <AddUserModal onClose={() => setShowAddModal(false)} onSuccess={() => {}} />}
      {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSuccess={() => {}} />}

      {/* Search + Count Bar */}
      <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <div className="input-with-icon" style={{ flex: 1 }}>
          <Search size={16} className="input-icon" />
          <input
            type="text"
            placeholder="Search by name or mobile number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: "10px 14px 10px 40px", fontSize: "0.9rem" }}
          />
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.18)",
          color: "var(--accent-primary)", borderRadius: 8,
          padding: "6px 14px", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.05em",
          whiteSpace: "nowrap",
        }}>
          <Users size={13} />
          {isLoading ? "â€”" : patients?.length ?? 0} STUDENTS
        </span>
      </div>

      {/* Directory Panel */}
      <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>

        {/* Column Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 1.5fr 0.85fr 0.85fr 1.6fr",
          padding: "12px 24px",
          background: "#f8fafc",
          borderBottom: "1px solid var(--border-color)",
          gap: 12,
        }}>
          {["Student", "Mobile / Login", "Status", "Role", "Actions"].map((h, i) => (
            <span key={h} style={{
              fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase" as const,
              letterSpacing: "0.08em", color: "var(--text-secondary)",
              textAlign: i === 4 ? "right" as const : "left" as const,
            }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div style={{ padding: "56px 24px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Loading students...
          </div>
        ) : isEmpty ? (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            <Users size={40} style={{ color: "var(--border-color)", margin: "0 auto 12px", display: "block" }} />
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>No students found. Add a student to get started.</p>
          </div>
        ) : patients!.map((patient: any, idx: number) => {
          const isActive = (patient.status || "active") === "active";
          return (
            <div
              key={patient._id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.5fr 0.85fr 0.85fr 1.6fr",
                alignItems: "center",
                padding: "15px 24px",
                gap: 12,
                borderBottom: idx === patients!.length - 1 ? "none" : "1px solid var(--border-color)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(37,99,235,0.025)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            >
              {/* Identity */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <Avatar name={patient.full_name || ""} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ fontWeight: 600, fontSize: "0.93rem", color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {patient.full_name}
                    </p>
                    <span style={{
                      fontFamily: "monospace", fontSize: "0.72rem", fontWeight: 700,
                      background: "rgba(99,102,241,0.12)", color: "#4f46e5",
                      border: "1px solid rgba(99,102,241,0.25)",
                      padding: "2px 7px", borderRadius: 6,
                    }}>
                      #{patient.patientId}
                    </span>
                  </div>
                  <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Mail size={11} />{patient.email || "No email"}
                  </span>
                </div>
              </div>

              {/* Mobile */}
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Phone size={13} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                <span style={{
                  fontFamily: "monospace", fontSize: "0.88rem", fontWeight: 600,
                  color: "var(--accent-primary)",
                  background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.14)",
                  padding: "3px 9px", borderRadius: 7,
                }}>
                  {patient.mobile_number}
                </span>
              </div>

              {/* Status */}
              <div><StatusPill status={patient.status || "active"} /></div>

              {/* Role */}
              <div>
                <span style={{
                  fontSize: "0.76rem", fontWeight: 600, color: "var(--text-secondary)",
                  background: "var(--surface-hover)", border: "1px solid var(--border-color)",
                  padding: "3px 10px", borderRadius: 20, textTransform: "capitalize",
                }}>
                  {patient.role === "patient" ? "Student" : patient.role}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => navigate(`/patients/${patient._id}`)} title="View clinical state" style={actionBtnStyle("blue")}>
                  <BarChart2 size={13} /><span>View</span>
                </button>
                <button onClick={() => setEditingUser(patient)} title="Edit user" style={actionBtnStyle("default")}>
                  <Edit2 size={13} /><span>Edit</span>
                </button>
                <button
                  onClick={() => handleResetPassword(patient)}
                  disabled={resetLoading === patient._id}
                  title="Reset password"
                  style={actionBtnStyle("amber")}
                >
                  <KeyRound size={13} /><span>{resetLoading === patient._id ? "..." : "Reset"}</span>
                </button>
                <button
                  onClick={() => handleToggleStatus(patient._id, patient.status || "active")}
                  title={isActive ? "Deactivate" : "Activate"}
                  style={actionBtnStyle(isActive ? "orange" : "green")}
                >
                  {isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                </button>
                <button onClick={() => handleDeleteUser(patient._id, patient.full_name)} title="Delete user" style={actionBtnStyle("red")}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}

        {hasMore && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "center", background: "#f8fafc" }}>
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="btn btn-secondary"
              style={{ padding: "8px 24px", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "8px" }}
            >
              {loadingMore ? "Loading more students..." : "Load More Students"}
            </button>
          </div>
        )}
      </div>

      {/* CONFIRM MODAL */}
      {confirmConfig && createPortal(
        <div style={overlayStyle}>
          <div className="glass-panel animate-fade-in" style={{
            width: "100%", maxWidth: 400, padding: "36px 32px", borderRadius: 20,
            borderTop: `3px solid ${confirmConfig.isDanger ? "var(--danger)" : "var(--success)"}`,
            display: "flex", flexDirection: "column", gap: 22, alignItems: "center", textAlign: "center",
          }}>
            <div style={{
              padding: 16,
              background: confirmConfig.isDanger ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
              borderRadius: "50%",
              color: confirmConfig.isDanger ? "var(--danger)" : "var(--success)",
              border: `1px solid ${confirmConfig.isDanger ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`,
            }}>
              {confirmConfig.isDanger ? <ShieldAlert size={32} /> : <ShieldCheck size={32} />}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{confirmConfig.title}</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.87rem", margin: 0, lineHeight: 1.6 }}>{confirmConfig.message}</p>
            </div>
            <div style={{ display: "flex", gap: 10, width: "100%" }}>
              <button className="btn btn-secondary" style={{ flex: 1, padding: "11px" }} onClick={() => setConfirmConfig(null)}>Cancel</button>
              <button
                className={confirmConfig.isDanger ? "btn btn-danger" : "btn btn-primary"}
                style={{ flex: 1, padding: "11px" }}
                onClick={() => { confirmConfig.onConfirm(); setConfirmConfig(null); }}
              >
                {confirmConfig.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* RESET PASSWORD RESULT MODAL */}
      {resetResult && createPortal(
        <div style={overlayStyle}>
          <div className="glass-panel animate-fade-in" style={{
            width: "100%", maxWidth: 460, padding: "36px 32px", borderRadius: 20,
            borderTop: "3px solid #f59e0b",
            display: "flex", flexDirection: "column", gap: 22,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ padding: 14, background: "rgba(245,158,11,0.12)", borderRadius: "50%", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", flexShrink: 0 }}>
                <KeyRound size={24} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>Password Reset Successful</h2>
                <p style={{ margin: 0, fontSize: "0.81rem", color: "var(--text-secondary)" }}>Share these credentials with the user personally</p>
              </div>
            </div>

            <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <CredField label="Name" value={resetResult.userName} />
              <CredField label="Login ID (Mobile)" value={resetResult.mobile} onCopy={() => handleCopy(resetResult.mobile)} />
              <div>
                <span style={credLabelStyle}>New Temporary Password</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                  <code style={{
                    flex: 1, fontFamily: "monospace",
                    background: "rgba(245,158,11,0.08)", border: "1.5px solid rgba(245,158,11,0.4)",
                    padding: "10px 14px", borderRadius: 9,
                    fontSize: "1.3rem", fontWeight: 700, color: "#f59e0b", letterSpacing: "0.12em",
                  }}>
                    {resetResult.newPassword}
                  </code>
                  <button
                    onClick={() => handleCopy(resetResult!.newPassword)}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: copied ? "var(--success)" : "var(--accent-primary)", padding: 6, display: "flex", alignItems: "center", gap: 4, fontSize: "0.8rem", fontWeight: 600 }}
                  >
                    {copied ? <><CheckCheck size={17} /> Copied!</> : <><Copy size={17} /> Copy</>}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, padding: "11px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 10, alignItems: "flex-start" }}>
              <span>Warning:</span>
              <p style={{ margin: 0, fontSize: "0.79rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <strong style={{ color: "var(--text-primary)" }}>Security notice:</strong> This password is shown only once. Share it via a secure personal channel only.
              </p>
            </div>

            <button className="btn btn-primary" style={{ padding: "12px", fontSize: "0.9rem" }} onClick={() => { setResetResult(null); setCopied(false); }}>
              Done - I have noted the Password
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
