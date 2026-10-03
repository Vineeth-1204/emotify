import { TrendingUp, Users, Activity, HeartPulse, Brain, Award } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function Analytics() {
  const data = useQuery(api.dashboard.getEnterpriseAnalytics);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }} className="animate-fade-in">
      <div>
        <h1 style={{ fontSize: "2.4rem", marginBottom: "8px", color: "var(--text-primary)" }}>
          Enterprise Clinical Analytics
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem" }}>
          Cohort population, institutional screening averages, CBT session completion rates, and clinical efficiency metrics.
        </p>
      </div>

      <div className="grid-3">
        <div className="glass-panel hud-panel" style={{ borderTop: "2px solid var(--accent-primary)" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Enrolled Students</span>
          <p style={{ fontSize: "2.2rem", fontWeight: 800, margin: "8px 0 4px 0" }}>{data?.totalPatients || 0}</p>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Total registered cohort</span>
        </div>

        <div className="glass-panel hud-panel" style={{ borderTop: "2px solid var(--success)" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Institutional Mean PHQ-9 (Depression Screening)</span>
          <p style={{ fontSize: "2.2rem", fontWeight: 800, margin: "8px 0 4px 0", color: "var(--success)" }}>{data?.avgPhqScore || "0"} pts</p>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Cross-sectional cohort mean</span>
        </div>

        <div className="glass-panel hud-panel" style={{ borderTop: "2px solid var(--warning)" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Institutional Mean GAD-7 (Anxiety Screening)</span>
          <p style={{ fontSize: "2.2rem", fontWeight: 800, margin: "8px 0 4px 0", color: "var(--warning)" }}>{data?.avgGadScore || "0"} pts</p>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Cross-sectional cohort mean</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="glass-panel hud-panel">
          <h3 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>Clinical Risk Level Distribution</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.9rem" }}>
                <span>Mild Risk</span>
                <strong>{data?.riskDistribution?.mild || 0} Patients</strong>
              </div>
              <div style={{ height: "8px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.2)" }} />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.9rem" }}>
                <span>Moderate Risk</span>
                <strong>{data?.riskDistribution?.moderate || 0} Patients</strong>
              </div>
              <div style={{ height: "8px", borderRadius: "4px", background: "rgba(245, 158, 11, 0.2)" }} />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.9rem" }}>
                <span>Severe / Critical Risk</span>
                <strong>{data?.riskDistribution?.severe || 0} Patients</strong>
              </div>
              <div style={{ height: "8px", borderRadius: "4px", background: "rgba(244, 63, 94, 0.2)" }} />
            </div>
          </div>
        </div>

        <div className="glass-panel hud-panel">
          <h3 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>Therapeutic Interventions Summary</h3>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>Total CBT Sessions Conducted: <strong>{data?.totalSessions || 0}</strong></p>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>Completed CBT Protocols: <strong>{data?.completedSessions || 0}</strong></p>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>Total Emotion Logs Recorded: <strong>{data?.totalEmotionLogs || 0}</strong></p>
        </div>
      </div>
    </div>
  );
}
