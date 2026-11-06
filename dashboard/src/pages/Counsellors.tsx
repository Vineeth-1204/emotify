import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCircle2, Copy, Eye, EyeOff, Link2, Link2Off, Mail, Pencil, Phone, Plus, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LoadingState } from "../components/UIComponents";

type Entry = NonNullable<ReturnType<typeof useQuery<typeof api.counsellorDirectory.listForAdmin>>>[number];

const errorText = (e: unknown) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : "Something went wrong.");

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
function generateSecurePassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let pass = "";
  for (let i = 0; i < length; i++) {
    pass += PASSWORD_CHARS.charAt(bytes[i] % PASSWORD_CHARS.length);
  }
  return pass;
}

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
  const [showProvision, setShowProvision] = useState(false);
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
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => setShowProvision(true)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserPlus size={18} /> Add &amp; provision counsellor
          </button>
          <button className="btn btn-secondary" onClick={() => setShowAdd(true)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plus size={18} /> Add directory entry only
          </button>
        </div>
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

      {showProvision && (
        <ProvisionCounsellorModal onClose={() => setShowProvision(false)} />
      )}

      {showAdd &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-entry-title"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.55)",
              backdropFilter: "blur(10px)",
              zIndex: 99999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "32px 16px",
              overflowY: "auto",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowAdd(false);
            }}
          >
            <form
              onSubmit={handleAdd}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel"
              style={{
                background: "#ffffff",
                width: "100%",
                maxWidth: 480,
                margin: "auto",
                maxHeight: "calc(100vh - 64px)",
                overflowY: "auto",
                padding: 28,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                borderRadius: 20,
                border: "1px solid var(--border-color)",
                boxShadow: "0 25px 70px rgba(0, 0, 0, 0.25)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 id="add-entry-title" style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    Add directory entry
                  </h2>
                  <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Add institutional details for student appointment booking.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  aria-label="Close"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>

              <label style={labelStyle}>Name *<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></label>
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
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>New entries share nothing with students until each contact field is approved.</p>
              {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
}

function ProvisionCounsellorModal({ onClose }: { onClose: () => void }) {
  const provision = useMutation(api.counsellorDirectory.provisionCounsellor);
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState(() => generateSecurePassword());
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [campus, setCampus] = useState("");
  const [role, setRole] = useState("counsellor");
  const [specialization, setSpecialization] = useState("");
  const [maxWorkload, setMaxWorkload] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdInfo, setCreatedInfo] = useState<{
    name: string;
    mobile: string;
    pass: string;
    campus?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter the counsellor's full name.");
      return;
    }

    const cleanMobile = mobileNumber.replace(/\D/g, "");
    if (cleanMobile.length !== 10) {
      setError("Please enter a valid 10-digit mobile number for login.");
      return;
    }

    if (!password || password.length < 6) {
      setError("Initial password must be at least 6 characters long.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter an institutional email address.");
      return;
    }

    if (maxWorkload < 1 || maxWorkload > 20) {
      setError("Caseload capacity must be between 1 and 20 students (limit: 20).");
      return;
    }

    setBusy(true);
    try {
      await provision({
        name: name.trim(),
        mobile_number: cleanMobile,
        password: password.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        campus: campus.trim() || undefined,
        role,
        specialization: specialization.trim() || undefined,
        maxWorkload,
      });

      setCreatedInfo({
        name: name.trim(),
        mobile: cleanMobile,
        pass: password.trim(),
        campus: campus.trim() || undefined,
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = () => {
    if (!createdInfo) return;
    const text = `Emotify Counsellor Credentials\nName: ${createdInfo.name}\nMobile (Login): ${createdInfo.mobile}\nPassword: ${createdInfo.pass}${createdInfo.campus ? `\nCampus: ${createdInfo.campus}` : ""}\nRole: Counsellor`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="provision-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(10px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          width: "100%",
          maxWidth: 540,
          margin: "auto",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          padding: 28,
          borderRadius: 20,
          border: "1px solid var(--border-color)",
          boxShadow: "0 25px 70px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 id="provision-modal-title" style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              {createdInfo ? "Counsellor provisioned successfully" : "Add & provision counsellor"}
            </h2>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.86rem", color: "var(--text-secondary)" }}>
              {createdInfo
                ? "The counsellor login account and staff directory profile are linked and ready."
                : "Creates an authenticated counsellor account and directory record in one atomic operation."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {createdInfo ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: "rgba(16, 185, 129, 0.1)",
                borderRadius: 10,
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#047857",
              }}
            >
              <CheckCircle2 size={24} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: "0.88rem" }}>
                <strong>Account &amp; directory profile linked!</strong>
                <p style={{ margin: "2px 0 0 0" }}>The counsellor can now sign in using their mobile number and initial password.</p>
              </div>
            </div>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                padding: 16,
                fontSize: "0.88rem",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div><strong style={{ color: "var(--text-secondary)", fontSize: "0.76rem", textTransform: "uppercase" }}>Full Name:</strong> <div>{createdInfo.name}</div></div>
              <div><strong style={{ color: "var(--text-secondary)", fontSize: "0.76rem", textTransform: "uppercase" }}>Login Mobile Number:</strong> <div><code>{createdInfo.mobile}</code></div></div>
              <div>
                <strong style={{ color: "var(--text-secondary)", fontSize: "0.76rem", textTransform: "uppercase" }}>Initial Password:</strong>
                <div style={{ fontFamily: "monospace", fontSize: "0.95rem", background: "#fff", padding: "6px 10px", borderRadius: 6, border: "1px dashed var(--input-border)", marginTop: 2 }}>
                  {createdInfo.pass}
                </div>
              </div>
              {createdInfo.campus && (
                <div><strong style={{ color: "var(--text-secondary)", fontSize: "0.76rem", textTransform: "uppercase" }}>Campus:</strong> <div>{createdInfo.campus}</div></div>
              )}
            </div>

            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: 0 }}>
              Copy and safely communicate these temporary credentials to the counsellor. Login details are never shared with students.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCopy}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied!" : "Copy credentials"}
              </button>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={labelStyle}>
              Full Name *
              <input
                required
                placeholder="e.g. Dr. Sarah Rao"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={labelStyle}>
                Login Mobile Number (10 digits) *
                <input
                  required
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Campus
                <input
                  placeholder="e.g. Main Campus"
                  value={campus}
                  onChange={(e) => setCampus(e.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>

            <label style={labelStyle}>
              Initial Password *
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...inputStyle, width: "100%", paddingRight: 76 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 40,
                    background: "none",
                    border: "none",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => setPassword(generateSecurePassword())}
                  aria-label="Generate new secure password"
                  title="Generate new secure password"
                  style={{
                    position: "absolute",
                    right: 10,
                    background: "none",
                    border: "none",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={labelStyle}>
                Institutional Email *
                <input
                  required
                  type="email"
                  placeholder="counsellor@campus.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Institutional Phone
                <input
                  type="tel"
                  placeholder="+91 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
              <label style={labelStyle}>
                Clinical Role / Title
                <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
                  <option value="counsellor">Counsellor</option>
                  <option value="senior_psychiatrist">Senior psychiatrist</option>
                  <option value="lead">Lead therapist</option>
                </select>
              </label>

              <label style={labelStyle}>
                Caseload Capacity (Max 20)
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={maxWorkload}
                  onChange={(e) => setMaxWorkload(Number(e.target.value))}
                  style={inputStyle}
                />
              </label>
            </div>

            <label style={labelStyle}>
              Specializations
              <input
                placeholder="e.g. Anxiety, Depression, Academic Stress, CBT"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                style={inputStyle}
              />
            </label>

            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "4px 0" }}>
              The account is assigned the counsellor role server-side and linked to the directory record. Institutional contact details remain hidden from students until approved.
            </p>

            {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>{error}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <UserPlus size={16} />
                {busy ? "Provisioning…" : "Provision & Link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
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
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
            <span className="badge badge-blue" style={{ fontSize: "0.72rem" }}>{entry.role}</span>
            {entry.specialization && (
              <span className="badge" style={{ fontSize: "0.72rem", background: "rgba(100, 116, 139, 0.1)", color: "var(--text-secondary)" }}>
                {entry.specialization}
              </span>
            )}
            <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
              Max: {entry.maxWorkload || 20}
            </span>
          </div>
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
