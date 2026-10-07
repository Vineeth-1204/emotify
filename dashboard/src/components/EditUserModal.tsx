import { useState } from "react";
import { createPortal } from "react-dom";
import { X, User, Phone } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface UserType {
  _id: string;
  full_name: string;
  mobile_number: string;
  email?: string;
  status: string;
}

export default function EditUserModal({ user, onClose, onSuccess }: { user: UserType, onClose: () => void, onSuccess: () => void }) {
  const editUser = useMutation(api.users.editUser);

  const [fullName, setFullName] = useState(user.full_name);
  const [mobileNumber, setMobileNumber] = useState(user.mobile_number);
  const [email, setEmail] = useState(user.email || "");
  const [status, setStatus] = useState(user.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !mobileNumber.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    if (!/^\d{10}$/.test(mobileNumber.trim())) {
      setError("Mobile number must be a valid 10-digit number.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await editUser({
        userId: user._id as any,
        full_name: fullName.trim(),
        mobile_number: mobileNumber.trim(),
        email: email.trim() || undefined,
        status,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update user.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(15, 23, 42, 0.4)",
      backdropFilter: "blur(14px)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}>
      <div className="glass-panel" style={{
        width: "100%",
        maxWidth: 500,
        padding: 36,
        borderRadius: 20,
        border: "1px solid var(--border-color)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.12)",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px 0" }}>Edit Student</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
              Update credentials and active status for this student profile.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 6,
              borderRadius: "50%",
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>Full Name</label>
            <div style={{ position: "relative" }}>
              <User size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
              <input
                type="text"
                placeholder="Enter full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              style={{
                  width: "100%",
                  background: "#ffffff",
                  border: "1px solid var(--input-border)",
                  padding: "12px 12px 12px 38px",
                  borderRadius: "10px",
                  color: "var(--text-primary)",
                  fontSize: "0.95rem",
                  outline: "none",
                  boxSizing: "border-box" as const,
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>Email Address (Optional)</label>
            <div style={{ position: "relative" }}>
              <input
                type="email"
                placeholder="patient@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  background: "#ffffff",
                  border: "1px solid var(--input-border)",
                  padding: "12px 12px 12px 16px",
                  borderRadius: "10px",
                  color: "var(--text-primary)",
                  fontSize: "0.95rem",
                  outline: "none",
                  boxSizing: "border-box" as const,
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>Mobile Number (Unique)</label>
            <div style={{ position: "relative" }}>
              <Phone size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
              <input
                type="text"
                placeholder="10-digit number"
                maxLength={10}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))}
              style={{
                  width: "100%",
                  background: "#ffffff",
                  border: "1px solid var(--input-border)",
                  padding: "12px 12px 12px 38px",
                  borderRadius: "10px",
                  color: "var(--text-primary)",
                  fontSize: "0.95rem",
                  outline: "none",
                  boxSizing: "border-box" as const,
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>Status</label>
            <div style={{ display: "flex", gap: "12px" }}>
              {["active", "inactive"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "8px",
                    border: `1px solid ${status === s
                      ? (s === "active" ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)")
                      : "var(--border-color)"}`,
                    background: status === s
                      ? (s === "active" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.08)")
                      : "#f8fafc",
                    color: status === s
                      ? (s === "active" ? "#10b981" : "#ef4444")
                      : "var(--text-secondary)",
                    cursor: "pointer",
                    fontWeight: 600,
                    textTransform: "capitalize" as const,
                    fontSize: "0.9rem",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{
              padding: "10px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "8px",
              color: "var(--danger)",
              fontSize: "0.85rem",
              textAlign: "center",
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ padding: "10px 20px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ padding: "10px 24px" }}
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
