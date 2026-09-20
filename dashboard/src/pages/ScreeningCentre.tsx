import { useState } from "react";
import { TrendingUp, Activity, AlertTriangle, ClipboardList, Users } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";

// Severity level helper
function phqLevel(avg: number) {
  if (avg >= 20) return { label: "Severe", color: "var(--danger)" };
  if (avg >= 15) return { label: "Mod-Severe", color: "#f97316" };
  if (avg >= 10) return { label: "Moderate", color: "var(--warning)" };
  if (avg >= 5)  return { label: "Mild", color: "#84cc16" };
  return { label: "Minimal", color: "var(--success)" };
}
function gadLevel(avg: number) {
  if (avg >= 15) return { label: "Severe", color: "var(--danger)" };
  if (avg >= 10) return { label: "Moderate", color: "var(--warning)" };
  if (avg >= 5)  return { label: "Mild", color: "#84cc16" };
  return { label: "Minimal", color: "var(--success)" };
}

export default function ScreeningCentre() {
  const [selectedScale, setSelectedScale] = useState<"all" | "phq9" | "gad7">("all");

  // Live data from Convex
  const analytics = useQuery(api.dashboard.getEnterpriseAnalytics);

  // All screenings for a global aggregate chart (no per-user filter = all)
  // We reuse the users query to build chart data from analytics
  const avgPhq = analytics ? parseFloat(analytics.avgPhqScore as string) : 0;
  const avgGad = analytics ? parseFloat(analytics.avgGadScore as string) : 0;
  const totalPatients = analytics?.totalPatients ?? 0;
  const phqLvl = phqLevel(avgPhq);
  const gadLvl = gadLevel(avgGad);
  const severeCount = analytics?.riskDistribution?.severe ?? 0;
  const suicideFlag = severeCount > 0;

  const isLoading = analytics === undefined;

  // Build a simple mock trend from risk distribution for the chart
  const chartData = analytics
    ? [
        {
          label: "Avg Scores",
          PHQ9: avgPhq,
          GAD7: avgGad,
        },
      ]
    : [];

  // Stat cards
  const statCards = [
    {
      label: "Avg PHQ-9 (Depression)",
      value: isLoading ? "—" : `${avgPhq} / 27`,
      sub: phqLvl.label,
      subColor: phqLvl.color,
      accent: phqLvl.color,
      icon: <Activity size={22} color={phqLvl.color} />,
    },
    {
      label: "Avg GAD-7 (Anxiety)",
      value: isLoading ? "—" : `${avgGad} / 21`,
      sub: gadLvl.label,
      subColor: gadLvl.color,
      accent: gadLvl.color,
      icon: <TrendingUp size={22} color={gadLvl.color} />,
    },
    {
      label: "Suicide Risk (Item 9)",
      value: isLoading ? "—" : suicideFlag ? `${severeCount} Flagged` : "None Flagged",
      sub: suicideFlag ? "Immediate Triage Priority" : "All Clear",
      subColor: suicideFlag ? "var(--danger)" : "var(--success)",
      accent: suicideFlag ? "var(--danger)" : "var(--success)",
      icon: <AlertTriangle size={22} color={suicideFlag ? "var(--danger)" : "var(--success)"} />,
    },
    {
      label: "Total Enrolled Patients",
      value: isLoading ? "—" : totalPatients,
      sub: `${analytics?.riskDistribution?.mild ?? 0} mild · ${analytics?.riskDistribution?.moderate ?? 0} moderate`,
      subColor: "var(--text-secondary)",
      accent: "var(--accent-primary)",
      icon: <Users size={22} color="var(--accent-primary)" />,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }} className="animate-fade-in">

      {/* Header */}
      <div>
        <h1 style={{ fontSize: "2rem", marginBottom: 6, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
          Clinical Screening Centre
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", margin: 0 }}>
          Live aggregate diagnostic data — PHQ-9, GAD-7, and PQ-16 triage across all enrolled patients.
        </p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
        {statCards.map((card) => (
          <div
            key={card.label}
            className="glass-panel"
            style={{ borderTop: `3px solid ${card.accent}`, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {card.label}
              </span>
              <div style={{ padding: 8, background: `${card.accent}15`, borderRadius: 10 }}>
                {card.icon}
              </div>
            </div>
            <p style={{ fontSize: "2rem", fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {card.value}
            </p>
            <span style={{ fontSize: "0.8rem", color: card.subColor, fontWeight: 600 }}>{card.sub}</span>
          </div>
        ))}
      </div>

      {/* Trend Chart */}
      <div className="glass-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: "1.1rem", display: "flex", alignItems: "center", gap: 10, margin: 0, color: "var(--text-primary)" }}>
            <TrendingUp size={18} color="var(--accent-primary)" /> Risk Distribution Breakdown
          </h3>
          <div style={{ display: "flex", gap: 8 }}>
            {(["all", "phq9", "gad7"] as const).map((s) => (
              <button
                key={s}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: `1px solid ${selectedScale === s ? "var(--accent-primary)" : "var(--border-color)"}`,
                  background: selectedScale === s ? "rgba(37,99,235,0.08)" : "#f8fafc",
                  color: selectedScale === s ? "var(--accent-primary)" : "var(--text-secondary)",
                  fontWeight: selectedScale === s ? 700 : 500,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
                onClick={() => setSelectedScale(s)}
              >
                {s === "all" ? "All Scales" : s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
            Loading live screening data...
          </div>
        ) : (
          <div style={{ height: 300, width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={[
                  { name: "Mild", value: analytics?.riskDistribution?.mild ?? 0, patients: analytics?.riskDistribution?.mild ?? 0 },
                  { name: "Moderate", value: analytics?.riskDistribution?.moderate ?? 0, patients: analytics?.riskDistribution?.moderate ?? 0 },
                  { name: "Severe", value: analytics?.riskDistribution?.severe ?? 0, patients: analytics?.riskDistribution?.severe ?? 0 },
                ]}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorPatients" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}
                  formatter={(val) => [`${val} patients`, "Count"]}
                />
                <Area type="monotone" dataKey="patients" name="Patients" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorPatients)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Score Summary Table */}
      <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: 10 }}>
          <ClipboardList size={18} color="var(--accent-primary)" />
          <h3 style={{ fontSize: "1rem", color: "var(--text-primary)", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Aggregate Score Summary
          </h3>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 0,
        }}>
          {[
            { scale: "PHQ-9", desc: "Depression", avg: avgPhq, max: 27, level: phqLvl },
            { scale: "GAD-7", desc: "Anxiety", avg: avgGad, max: 21, level: gadLvl },
            { scale: "Severe Cases", desc: "Triage Priority", avg: severeCount, max: totalPatients, level: { label: severeCount > 0 ? "Needs Review" : "All Clear", color: severeCount > 0 ? "var(--danger)" : "var(--success)" } },
            { scale: "Total Screened", desc: "Enrolled Patients", avg: totalPatients, max: totalPatients, level: { label: "Active", color: "var(--accent-primary)" } },
          ].map(({ scale, desc, avg, max, level }, i) => (
            <div
              key={scale}
              style={{
                padding: "20px 24px",
                borderRight: i < 3 ? "1px solid var(--border-color)" : "none",
                display: "flex", flexDirection: "column", gap: 6,
              }}
            >
              <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{scale}</span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{desc}</span>
              <p style={{ fontSize: "1.8rem", fontWeight: 800, margin: "4px 0", color: level.color }}>{isLoading ? "—" : avg}</p>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: level.color }}>
                {level.label}{max !== avg && max > 0 ? ` / ${max}` : ""}
              </span>
              {/* Progress bar */}
              <div style={{ height: 4, background: "#f1f5f9", borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${max > 0 ? Math.min((avg / max) * 100, 100) : 0}%`, background: level.color, borderRadius: 4, transition: "width 0.5s ease" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
