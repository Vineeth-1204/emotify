import { useState } from "react";
import { useDashboardAuth } from "../components/AuthContext";
import { useNavigate } from "react-router-dom";
import { Activity, Lock, Phone, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const { login } = useDashboardAuth();
  const navigate = useNavigate();
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobileNumber.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    setError("");
    setLoading(true);

    const res = await login(mobileNumber, password);
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="staff-login-page">
      <div className="glass-panel" style={{
        maxWidth: "440px",
        width: "calc(100% - 32px)",
        padding: "36px",
        borderRadius: "20px",
        boxShadow: "0 12px 36px rgba(31, 45, 61, 0.1)",
        display: "flex",
        flexDirection: "column",
        gap: "24px"
      }}>
        <div className="staff-login-brand">
          <div className="staff-login-mark" style={{
            padding: "16px",
            background: "rgba(37, 99, 235, 0.08)",
            borderRadius: "16px",
            color: "var(--accent-primary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(37, 99, 235, 0.15)"
          }}>
            <Activity size={32} color="var(--accent-primary)" />
          </div>
          <h1>Welcome to Emotify</h1>
          <p className="staff-login-kicker">Staff Portal</p>
          <p className="staff-login-description">Sign in to review student wellbeing and provide support.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>Mobile Number</label>
            <div className="input-with-icon">
              <Phone size={18} className="input-icon" />
              <input
                type="text"
                placeholder="Enter the admin number"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>Password</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter the admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: "48px" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "16px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              padding: "12px 16px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "10px",
              color: "#b91c1c",
              fontSize: "0.875rem",
              fontWeight: 600,
              textAlign: "center"
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              fontSize: "1rem",
              fontWeight: 650,
              display: "flex",
              justifyContent: "center",
              alignItems: "center"
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
