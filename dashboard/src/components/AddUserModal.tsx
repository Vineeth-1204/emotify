import { useState } from "react";
import { createPortal } from "react-dom";
import { X, User, Phone, Lock, Eye, EyeOff, RefreshCw, CheckCircle } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function AddUserModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const createUser = useMutation(api.users.createUser);

  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("Password@123");
  const [status, setStatus] = useState("active");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdUserInfo, setCreatedUserInfo] = useState<{ fullName: string; mobile: string; email?: string; pass: string } | null>(null);

  const generatePassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let pass = "";
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTempPassword(pass);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !mobileNumber.trim() || !tempPassword.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    // Basic mobile validation
    if (!/^\d{10}$/.test(mobileNumber.trim())) {
      setError("Mobile number must be a valid 10-digit number.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await createUser({
        full_name: fullName.trim(),
        mobile_number: mobileNumber.trim(),
        email: email.trim() || undefined,
        password: tempPassword.trim(),
        status,
        role: "patient",
      });

      // Save info to show in success step
      setCreatedUserInfo({
        fullName: fullName.trim(),
        mobile: mobileNumber.trim(),
        email: email.trim() || undefined,
        pass: tempPassword.trim(),
      });
      
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to create user. Mobile number may already exist.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(15, 23, 42, 0.45)",
      backdropFilter: "blur(12px)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px"
    }}>
      <div className="glass-panel" style={{
        width: "100%",
        maxWidth: "500px",
        padding: "36px",
        borderRadius: "20px",
        border: "1px solid var(--border-color)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.15)",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: "24px"
      }}>
        {createdUserInfo ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", textAlign: "center", alignItems: "center" }}>
            <div style={{
              padding: "16px",
              background: "rgba(16, 185, 129, 0.1)",
              borderRadius: "50%",
              color: "var(--success)"
            }}>
              <CheckCircle size={48} color="#10B981" />
            </div>
            <div>
              <h2 style={{ color: "var(--text-primary)", margin: "0 0 8px 0" }}>User Created Successfully</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
                Please share the login credentials below with the user.
              </p>
            </div>

            <div style={{
              width: "100%",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              textAlign: "left",
              boxSizing: "border-box"
            }}>
              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block" }}>Full Name</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "1rem" }}>{createdUserInfo.fullName}</span>
              </div>
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block" }}>Mobile Number</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "1rem" }}>{createdUserInfo.mobile}</span>
              </div>
              {createdUserInfo.email && (
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block" }}>Email Address</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "1rem" }}>{createdUserInfo.email}</span>
                </div>
              )}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block" }}>Temporary Password</span>
                <span style={{ color: "#3730a3", fontWeight: 600, fontSize: "1.1rem", fontFamily: "monospace", background: "rgba(99, 102, 241, 0.1)", padding: "4px 8px", borderRadius: "6px", display: "inline-block" }}>
                  {createdUserInfo.pass}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="btn btn-primary"
              style={{ width: "100%", padding: "12px" }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px 0" }}>Add Student</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
                  Create a student profile with secure temporary access.
                </p>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  padding: "6px",
                  borderRadius: "50%"
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
                      boxSizing: "border-box"
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
                      boxSizing: "border-box"
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
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>Temporary Password</label>
                  <button
                    type="button"
                    onClick={generatePassword}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-primary)",
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontWeight: 600
                    }}
                  >
                    <RefreshCw size={12} /> Auto-generate
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <Lock size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    style={{
                      width: "100%",
                      background: "#ffffff",
                      border: "1px solid var(--input-border)",
                      padding: "12px 38px 12px 38px",
                      borderRadius: "10px",
                      color: "var(--text-primary)",
                      fontSize: "0.95rem",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      padding: 0
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>Status</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setStatus("active")}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: status === "active" ? "1px solid var(--accent-primary)" : "1px solid var(--border-color)",
                      background: status === "active" ? "rgba(37, 99, 235, 0.08)" : "#f8fafc",
                      color: status === "active" ? "var(--accent-primary)" : "var(--text-secondary)",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("inactive")}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: status === "inactive" ? "1px solid var(--danger)" : "1px solid var(--border-color)",
                      background: status === "inactive" ? "rgba(239, 68, 68, 0.08)" : "#f8fafc",
                      color: status === "inactive" ? "var(--danger)" : "var(--text-secondary)",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Inactive
                  </button>
                </div>
              </div>

              {error && (
                <div style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "var(--danger)",
                  fontSize: "0.85rem"
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: "12px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: "12px" }}
                >
                  {loading ? "Saving..." : "Save User"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
