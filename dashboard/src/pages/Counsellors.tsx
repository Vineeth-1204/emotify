import { useMemo, useState } from "react";
import { Link2, Link2Off, Mail, Pencil, Phone, Plus, ShieldCheck } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LoadingState } from "../components/UIComponents";

type Entry = NonNullable<ReturnType<typeof useQuery<typeof api.counsellorDirectory.listForAdmin>>>[number];

const errorText = (e: unknown) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : "Something went wrong.");

/**
 * Admin: the institution's counsellor directory. Each entry holds institutional contact
 * details, is linked to one counsellor login account, and controls separately whether its
 * email and phone are shown to that counsellor's students. The server enforces every rule
 * (admin-only, one entry per account, approvals cleared when a value or link changes).
 */
export default function Counsellors() {
  const entries = useQuery(api.counsellorDirectory.listForAdmin);
  const accounts = useQuery(api.counsellorAssignments.listCounsellorUsers, { includeInactive: true });
  const addCounsellor = useMutation(api.dashboard.addCounsellor);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "counsellor", userId: "" });
  const [error, setError] = useState("");

  const linkedIds = useMemo(() => new Set((entries || []).map((e) => e.linkedAccount && String(e.linkedAccount._id)).filter(Boolean) as string[]), [entries]);
  const unlinkedAccounts = (accounts || []).filter((a) => !linkedIds.has(String(a._id)));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await addCounsellor({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        availability: ["Mon-Fri (09:00 - 17:00)"],
        maxWorkload: 15,
        userId: form.userId ? (form.userId as Id<"users">) : undefined,
      });
      setShowAdd(false);
      setForm({ name: "", email: "", phone: "", role: "counsellor", userId: "" });
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (entries === undefined || accounts === undefined) return <LoadingState message="Loading counsellor directory…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }} className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: 6, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>Counsellor directory</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", maxWidth: 760 }}>
            Institutional contact details for each counsellor. Students see a counsellor’s email or phone only when that field is approved here.
            Changing a stored value or the linked account hides it from students again until it is re-approved. Login details are never shown to students.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Plus size={18} /> Add directory entry
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
          No directory entries yet. Add one to share a counsellor’s institutional contact details with their students.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 20 }}>
          {entries.map((entry) => (
            <DirectoryCard key={entry._id} entry={entry} unlinkedAccounts={unlinkedAccounts} />
          ))}
        </div>
      )}

      {showAdd && (
        <div role="dialog" aria-modal="true" aria-labelledby="add-entry-title" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <form onSubmit={handleAdd} className="glass-panel" style={{ background: "#fff", width: "92%", maxWidth: 480, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 id="add-entry-title" style={{ fontSize: "1.2rem" }}>Add directory entry</h2>
            <label style={labelStyle}>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></label>
            <label style={labelStyle}>Institutional email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} /></label>
            <label style={labelStyle}>Institutional phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} /></label>
            <label style={labelStyle}>Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inputStyle}>
                <option value="counsellor">Counsellor</option>
                <option value="senior_psychiatrist">Senior psychiatrist</option>
                <option value="lead">Lead therapist</option>
              </select>
            </label>
            <label style={labelStyle}>Counsellor account (optional)
              <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} style={inputStyle}>
                <option value="">Link later</option>
                {unlinkedAccounts.map((a) => <option key={a._id} value={String(a._id)}>{a.full_name}{a.status === "inactive" ? " (inactive)" : ""}</option>)}
              </select>
            </label>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>New entries share nothing with students until each contact field is approved.</p>
            {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" };
const inputStyle: React.CSSProperties = { padding: "9px 10px", borderRadius: 8, border: "1px solid var(--input-border)", fontSize: "0.9rem", fontWeight: 400, color: "var(--text-primary)" };

function DirectoryCard({ entry, unlinkedAccounts }: { entry: Entry; unlinkedAccounts: Array<{ _id: Id<"users">; full_name: string; status: string }> }) {
  const linkAccount = useMutation(api.counsellorDirectory.linkAccount);
  const unlinkAccount = useMutation(api.counsellorDirectory.unlinkAccount);
  const updateContact = useMutation(api.counsellorDirectory.updateContact);
  const setVisibility = useMutation(api.counsellorDirectory.setContactVisibility);
  const updateStatus = useMutation(api.dashboard.updateCounsellorStatus);

  const [linkTarget, setLinkTarget] = useState("");
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(entry.email);
  const [phone, setPhone] = useState(entry.phone);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const run = async (action: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (ok) setMessage({ kind: "ok", text: ok });
      return true;
    } catch (e) {
      setMessage({ kind: "error", text: errorText(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveContact = async () => {
    const wasShared = (email.trim() !== entry.email && entry.shareEmailWithStudents) || (phone.trim() !== entry.phone && entry.sharePhoneWithStudents);
    const ok = await run(() => updateContact({ entryId: entry._id, email, phone }), wasShared ? "Saved. Changed fields are hidden from students until re-approved." : "Saved.");
    if (ok) setEditing(false);
  };

  const unlink = () => {
    if (!window.confirm(`Unlink ${entry.linkedAccount?.full_name}? Their students will stop seeing these contact details, and approvals are cleared.`)) return;
    void run(() => unlinkAccount({ entryId: entry._id }), "Unlinked. Approvals were cleared.");
  };

  const toggle = (field: "email" | "phone", visible: boolean) =>
    run(() => setVisibility({ entryId: entry._id, field, visible }), visible ? `${field === "email" ? "Email" : "Phone"} is now shown to students.` : `${field === "email" ? "Email" : "Phone"} is now hidden from students.`);

  return (
    <article className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <h3 style={{ fontSize: "1.08rem", fontWeight: 700 }}>{entry.name}</h3>
          <span className="badge badge-blue" style={{ fontSize: "0.72rem" }}>{entry.role}</span>
        </div>
        <span className={`badge ${entry.status === "active" ? "badge-green" : "badge-red"}`}>{entry.status === "active" ? "Listed" : "Not listed"}</span>
      </header>

      <section aria-label="Linked counsellor account" style={{ fontSize: "0.86rem" }}>
        <p style={{ fontWeight: 700, color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Counsellor account</p>
        {entry.linkedAccount ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link2 size={15} aria-hidden="true" />
            <strong>{entry.linkedAccount.full_name}</strong>
            {entry.linkedAccount.status === "inactive" && <span className="badge badge-red">Account inactive</span>}
            {!entry.linkedAccount.isCounsellor && <span className="badge badge-red">Not a counsellor account</span>}
            <span style={{ color: "var(--text-secondary)" }}>· {entry.linkedAccount.caseloadSize} assigned student{entry.linkedAccount.caseloadSize === 1 ? "" : "s"}</span>
            <button className="btn btn-secondary" style={{ marginLeft: "auto", padding: "5px 10px", fontSize: "0.78rem", display: "flex", gap: 4, alignItems: "center" }} disabled={busy} onClick={unlink}>
              <Link2Off size={13} /> Unlink
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select aria-label={`Counsellor account for ${entry.name}`} value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 180 }}>
              <option value="">Not linked: choose an account…</option>
              {unlinkedAccounts.map((a) => <option key={a._id} value={String(a._id)}>{a.full_name}{a.status === "inactive" ? " (inactive)" : ""}</option>)}
            </select>
            <button className="btn btn-primary" style={{ padding: "8px 12px" }} disabled={busy || !linkTarget} onClick={() => run(() => linkAccount({ entryId: entry._id, userId: linkTarget as Id<"users"> }), "Linked. Contact details stay hidden until approved.")}>
              Link
            </button>
          </div>
        )}
        {entry.duplicateLink && <p role="alert" style={{ color: "var(--danger)", marginTop: 6 }}>This account is linked to more than one entry, so no contact details are shown to its students. Unlink the extra entry.</p>}
      </section>

      <section aria-label="Contact details and student visibility">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <p style={{ fontWeight: 700, color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Institutional contact</p>
          {!editing && (
            <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.78rem", display: "flex", gap: 4, alignItems: "center" }} onClick={() => { setEmail(entry.email); setPhone(entry.phone); setEditing(true); }}>
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={labelStyle}>Institutional email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>Institutional phone<input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={saveContact} disabled={busy}>Save</button>
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <thead>
              <tr style={{ color: "var(--text-secondary)", fontSize: "0.72rem", textAlign: "left" }}>
                <th style={{ padding: "4px 0", fontWeight: 600 }}>Stored</th>
                <th style={{ padding: "4px 0", fontWeight: 600 }}>Shown to students</th>
              </tr>
            </thead>
            <tbody>
              {(["email", "phone"] as const).map((field) => {
                const value = field === "email" ? entry.email : entry.phone;
                const approved = field === "email" ? entry.shareEmailWithStudents : entry.sharePhoneWithStudents;
                const live = entry.studentVisible[field];
                return (
                  <tr key={field} style={{ borderTop: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "8px 8px 8px 0" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {field === "email" ? <Mail size={14} aria-hidden="true" /> : <Phone size={14} aria-hidden="true" />}
                        {value || <span style={{ color: "var(--text-secondary)" }}>Not stored</span>}
                      </span>
                    </td>
                    <td style={{ padding: "8px 0" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: busy ? "default" : "pointer" }}>
                        <input
                          type="checkbox"
                          aria-label={`Show ${field} to students`}
                          checked={approved}
                          disabled={busy || (!approved && (!value || !entry.linkedAccount))}
                          onChange={(e) => toggle(field, e.target.checked)}
                        />
                        {live ? (
                          <span style={{ color: "#047857", display: "inline-flex", alignItems: "center", gap: 4 }}><ShieldCheck size={14} /> Approved</span>
                        ) : (
                          <span style={{ color: "var(--text-secondary)" }}>{approved ? "Approved, but not shown" : "Hidden"}</span>
                        )}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!entry.linkedAccount && <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 6 }}>Link a counsellor account before approving contact details.</p>}
        {entry.status !== "active" && (entry.shareEmailWithStudents || entry.sharePhoneWithStudents) && (
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 6 }}>This entry is not listed, so nothing is shown to students.</p>
        )}
      </section>

      {message && <p role={message.kind === "error" ? "alert" : "status"} style={{ fontSize: "0.82rem", color: message.kind === "error" ? "var(--danger)" : "#047857" }}>{message.text}</p>}

      <footer style={{ borderTop: "1px solid var(--border-color)", paddingTop: 12 }}>
        <button className="btn btn-secondary" style={{ width: "100%", fontSize: "0.82rem" }} disabled={busy} onClick={() => run(() => updateStatus({ counsellorId: entry._id, status: entry.status === "active" ? "inactive" : "active" }))}>
          {entry.status === "active" ? "Remove from directory listing" : "List in directory"}
        </button>
      </footer>
    </article>
  );
}
