import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, User, Phone, Calendar, Heart, Shield, TrendingUp, AlertTriangle,
  Brain, Smile, CheckCircle, HelpCircle, MessageSquare, Award, Clock, ArrowRight,
  Unlock, RefreshCw, Compass, Wind, CheckSquare
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell
} from "recharts";
import { ClinicalTimelineView } from "../components/ClinicalTimelineView";

/* ─── Avatar helper (same as PatientsList) ────────────────────── */
function Avatar({ name, size = 44 }: { name: string; size?: number }) {
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
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.27),
        background: `linear-gradient(135deg, hsl(${hue},60%,55%), hsl(${(hue + 40) % 360},65%,60%))`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontWeight: 700,
        fontSize: size > 50 ? "1.2rem" : "0.85rem",
        color: "#fff",
        letterSpacing: "0.04em",
        boxShadow: `0 4px 14px hsl(${hue},50%,55%,0.3)`,
      }}
    >
      {initials}
    </div>
  );
}

function getMoodBadgeStyle(mood?: string) {
  const m = (mood || "").toLowerCase();
  switch (m) {
    case "good":
    case "great":
    case "happy":
    case "energized":
      return { background: "rgba(14, 165, 233, 0.1)", color: "#0284c7", border: "1px solid rgba(14, 165, 233, 0.25)" };
    case "calm":
    case "peaceful":
      return { background: "rgba(16, 185, 129, 0.1)", color: "#059669", border: "1px solid rgba(16, 185, 129, 0.25)" };
    case "low":
    case "sad":
    case "heavy":
      return { background: "rgba(99, 102, 241, 0.1)", color: "#4f46e5", border: "1px solid rgba(99, 102, 241, 0.25)" };
    case "worried":
    case "anxious":
      return { background: "rgba(245, 158, 11, 0.1)", color: "#d97706", border: "1px solid rgba(245, 158, 11, 0.25)" };
    default:
      return { background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1" };
  }
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Tab state: "screenings" | "timeline" | "cbt" | "somatic" | "gamification"
  const [activeTab, setActiveTab] = useState<"screenings" | "timeline" | "care" | "cbt" | "somatic" | "gamification">("screenings");
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  // Unblock modal state
  const [showUnblockModal, setShowUnblockModal] = useState(false);
  const [isSubmittingUnblock, setIsSubmittingUnblock] = useState(false);

  // Load patient user profile
  const patient = useQuery(api.users.getByClerkId, { clerkId: id || "" });
  // Load patient clinical test results
  const testResults = useQuery(api.screening.getAll, { userId: id || "" });
  // Load patient CBT therapy session records
  const cbtAnalytics = useQuery(api.dashboard.getPatientCbtAnalytics, { userId: id || "" });
  // Load latest triage status for this patient
  const latestTriage = useQuery(api.triage.getLatestByUserId, { userId: id || "" });
  // Load pending clinical safety alerts for this patient
  const pendingAlerts = useQuery(api.alerts.getPending, { userId: id || "" });
  // Load recent daily check-in telemetry for counselor inspection (non-diagnostic)
  const dailyCheckinTelemetry = useQuery(
    api.insights.getCounselorStudentDailyCheckins,
    id ? { userId: id, lookbackDays: 14 } : "skip"
  );

  // Load patient counselor requests
  const studentCounsellorRequests = useQuery(
    api.counsellorRequests.getStudentCounsellorRequests,
    id ? { userId: id } : "skip"
  );
  // Load patient appointments
  const studentAppointments = useQuery(
    api.appointments.getTwoWayAppointmentsForPatient,
    id ? { userId: id } : "skip"
  );
  // Load patient follow-ups
  const studentFollowUps = useQuery(
    api.followUps.getStudentFollowUps,
    id ? { userId: id } : "skip"
  );
  const markFollowUpCompleteMutation = useMutation(api.followUps.markComplete);
  const [completingFollowUpId, setCompletingFollowUpId] = useState<string | null>(null);

  const handleMarkFollowUpComplete = async (followUpId: any) => {
    try {
      setCompletingFollowUpId(String(followUpId));
      await markFollowUpCompleteMutation({ id: followUpId });
    } catch (e: any) {
      alert("Error completing follow-up: " + (e.message || e.toString()));
    } finally {
      setCompletingFollowUpId(null);
    }
  };

  const unblockPatientMutation = useMutation(api.triage.unblockPatient);
  const triggerScreeningMutation = useMutation(api.triage.triggerScreeningTest);
  const acknowledgeAlertMutation = useMutation(api.alerts.acknowledgeAlert);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState<string | null>(null);

  const handleAcknowledgeAlert = async (alertId: any) => {
    try {
      setAcknowledgingAlertId(String(alertId));
      await acknowledgeAlertMutation({ alertId });
    } catch (e: any) {
      alert("Error acknowledging alert: " + (e.message || e.toString()));
    } finally {
      setAcknowledgingAlertId(null);
    }
  };

  // Custom Trigger Screening Modal State
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [triggerSuccessMsg, setTriggerSuccessMsg] = useState(false);
  const [isTriggeringTest, setIsTriggeringTest] = useState(false);

  const confirmAndTriggerScreening = async () => {
    if (!id) return;
    try {
      setIsTriggeringTest(true);
      await triggerScreeningMutation({ userId: id });
      setTriggerSuccessMsg(true);
    } catch (e: any) {
      alert("Error triggering screening test: " + (e.message || e.toString()));
      setShowTriggerModal(false);
    } finally {
      setIsTriggeringTest(false);
    }
  };

  const handleUnblockAction = async (action: "switch_moderate" | "switch_low" | "force_retest") => {
    if (!id) return;
    try {
      setIsSubmittingUnblock(true);
      await unblockPatientMutation({ userId: id, action });
      setShowUnblockModal(false);
    } catch (e: any) {
      alert("Error unblocking patient: " + (e.message || e.toString()));
    } finally {
      setIsSubmittingUnblock(false);
    }
  };

  if (patient === undefined || testResults === undefined || cbtAnalytics === undefined || pendingAlerts === undefined) {
    return (
      <div style={{ display: "flex", minHeight: "60vh", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
        Loading patient profile and clinical data...
      </div>
    );
  }

  if (patient === null) {
    return (
      <div style={{ display: "flex", minHeight: "60vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        <p style={{ color: "var(--danger)", fontSize: "1.2rem" }}>Student not found.</p>
        <button className="btn btn-secondary" onClick={() => navigate("/patients")}>
          <ArrowLeft size={16} /> Back to Directory
        </button>
      </div>
    );
  }

  const canonicalStudentId = patient?._id ? String(patient._id) : (id || "");
  const currentLevel = latestTriage?.level || "mild";
  const isSevere = currentLevel === "severe" || currentLevel === "suicide_flag" || currentLevel === "psychosis_flag";

  // Format chart data for screenings
  const chartData = [...(testResults || [])]
    .reverse()
    .map((test) => {
      const date = new Date(test.createdAt);
      return {
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        PHQ9: test.phq9_total,
        GAD7: test.gad7_total,
        PQ16: test.pq16_total,
      };
    });

  // Parse CBT thinking traps stats for Bar Chart
  const thinkingTrapChartData = cbtAnalytics
    ? Object.keys(cbtAnalytics.thinkingStyleTrends).map(key => ({
      name: key.replace("I'm worried about ", "Worried about ").replace("I feel I should have ", "Should have ").replace("I feel stuck because ", "Stuck / "),
      Sessions: cbtAnalytics.thinkingStyleTrends[key]
    }))
    : [];

  const barColors = ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6"];

  const triageBg = isSevere
    ? "rgba(239,68,68,0.06)"
    : currentLevel === "moderate"
    ? "rgba(249,115,22,0.06)"
    : "rgba(16,185,129,0.06)";
  const triageBorder = isSevere ? "var(--danger)" : currentLevel === "moderate" ? "var(--warning)" : "var(--success)";
  const triageTextColor = isSevere ? "var(--danger)" : currentLevel === "moderate" ? "var(--warning)" : "var(--success)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }} className="animate-fade-in">

      {/* ── Active Safety Alert Banner ── */}
      {pendingAlerts && pendingAlerts.length > 0 && (
        <div
          className="glass-panel animate-fade-in"
          style={{
            background: "rgba(239, 68, 68, 0.06)",
            border: "1.5px solid var(--danger, #ef4444)",
            borderLeft: "6px solid var(--danger, #ef4444)",
            borderRadius: "12px",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  padding: "8px",
                  borderRadius: "8px",
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "var(--danger, #ef4444)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h2
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 800,
                    color: "var(--danger, #b91c1c)",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                  }}
                >
                  Active Safety Alert{pendingAlerts.length > 1 ? `s (${pendingAlerts.length})` : ""}
                </h2>
                <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  Operational alert requiring clinical review · Status: <strong>Pending</strong>
                </span>
              </div>
            </div>

            <button
              onClick={() => navigate("/alerts")}
              className="btn btn-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              Alerts Center <ArrowRight size={14} />
            </button>
          </div>

          {/* Alert items list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {pendingAlerts.map((alert: any) => (
              <div
                key={alert._id}
                style={{
                  background: "#ffffff",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        background: "rgba(239, 68, 68, 0.12)",
                        color: "var(--danger, #dc2626)",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Type: {alert.type || "Safety Alert"}
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={13} />
                      Created: {new Date(alert.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {/* Provenance identifiers */}
                  <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "monospace", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <span>Alert ID: {String(alert._id).slice(-8)}</span>
                    {alert.attemptId && <span>Attempt ID: {String(alert.attemptId).slice(-8)}</span>}
                    {alert.triageId && <span>Triage ID: {String(alert.triageId).slice(-8)}</span>}
                  </div>
                </div>

                <button
                  onClick={() => handleAcknowledgeAlert(alert._id)}
                  disabled={acknowledgingAlertId === String(alert._id)}
                  className="btn btn-secondary"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--accent-primary, #3b82f6)",
                    borderColor: "var(--accent-primary, #3b82f6)",
                    background: "rgba(59, 130, 246, 0.05)",
                  }}
                >
                  <CheckCircle size={14} />
                  {acknowledgingAlertId === String(alert._id) ? "Acknowledging..." : "Acknowledge Alert"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Patient Header Bar ── */}
      <div
        className="glass-panel"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          borderLeft: `4px solid ${triageBorder}`,
        }}
      >
        {/* Top Row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          {/* Left: back + identity */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/patients")}
              style={{ padding: "8px 12px", flexShrink: 0 }}
            >
              <ArrowLeft size={16} />
            </button>
            <Avatar name={patient.full_name || ""} size={52} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: "1.5rem", margin: "0 0 3px 0", color: "var(--text-primary)", letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {patient.full_name}
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>
                {patient.email || "No email"} · {patient.mobile_number || "No mobile"}
              </p>
            </div>
          </div>

          {/* Right: triage badge + actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 20,
                fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                background: triageBg,
                color: triageTextColor,
                border: `1px solid ${triageBorder}`,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
              {currentLevel.replace("_", " ")}
            </span>
            <button
              className="btn btn-secondary"
              disabled={isTriggeringTest}
              onClick={() => {
                setTriggerSuccessMsg(false);
                setShowTriggerModal(true);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", fontSize: "0.85rem", cursor: isTriggeringTest ? "not-allowed" : "pointer" }}
            >
              <RefreshCw size={14} className={isTriggeringTest ? "animate-spin" : ""} />
              {isTriggeringTest ? "Triggering..." : "Trigger Screening"}
            </button>
            {isSevere && (
              <button
                className="btn btn-danger"
                onClick={() => setShowUnblockModal(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", fontSize: "0.85rem" }}
              >
                <Unlock size={14} /> Review triage actions
              </button>
            )}
          </div>
        </div>

        {/* Stats Strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, background: "#f8fafc", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border-color)" }}>
          {[
            {
              label: "Counselor Request",
              val: studentCounsellorRequests && studentCounsellorRequests.length > 0
                ? (studentCounsellorRequests[0].status || "Pending").toUpperCase()
                : "None",
              color: studentCounsellorRequests && studentCounsellorRequests.length > 0 && studentCounsellorRequests[0].status === "pending"
                ? "var(--warning, #eab308)"
                : "var(--accent-primary, #3b82f6)",
            },
            {
              label: "Upcoming Consultation",
              val: (() => {
                const upcoming = studentAppointments?.find((a: any) => a.status === "accepted" || a.status === "pending");
                return upcoming ? `${upcoming.date} at ${upcoming.time}` : "None scheduled";
              })(),
              color: "var(--text-primary)",
            },
            { label: "Latest PHQ-9", val: testResults[0] ? `${testResults[0].phq9_total} / 27` : "—", color: "var(--warning)" },
            { label: "Latest GAD-7", val: testResults[0] ? `${testResults[0].gad7_total} / 21` : "—", color: "var(--success)" },
          ].map(({ label, val, color }) => (
            <div key={label}>
              <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>{label}</span>
              <p style={{ margin: "3px 0 0 0", fontSize: "0.95rem", fontWeight: 800, color }}>{val}</p>
            </div>
          ))}
        </div>
      </div>


      {/* ── Tab Switcher ── */}
      <div style={{ display: "flex", gap: 8, borderBottom: "2px solid var(--border-color)", paddingBottom: 0, overflowX: "auto" }}>
        {([
          { key: "screenings", label: "📋 Clinical Assessments" },
          { key: "timeline",   label: "⏱️ Clinical Timeline" },
          { key: "care",       label: "🗓️ Counselor Care & Follow-ups" },
          { key: "cbt",        label: "🧠 AI CBT & Recovery" },
          { key: "somatic",   label: "🧘 Somatic & Sensory Interventions" },
          { key: "gamification", label: "🏆 Gamification" },
        ] as { key: string; label: string }[]).map(({ key, label }) => {
          const active = (activeTab as string) === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              style={{
                padding: "10px 18px",
                borderRadius: "10px 10px 0 0",
                border: "1px solid transparent",
                borderBottom: active ? "2px solid var(--accent-primary)" : "2px solid transparent",
                background: active ? "rgba(37,99,235,0.07)" : "transparent",
                color: active ? "var(--accent-primary)" : "var(--text-secondary)",
                fontWeight: active ? 700 : 500,
                fontSize: "0.88rem",
                cursor: "pointer",
                transition: "all 0.18s",
                whiteSpace: "nowrap",
                marginBottom: -2,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>


      {/* RENDER TAB 1: CLINICAL assessments */}
      {activeTab === "screenings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
            {/* Left Column - General Info */}
            <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: 20 }}>
                <Avatar name={patient.full_name || ""} size={68} />
                <div>
                  <h2 style={{ color: "var(--text-primary)", fontSize: "1.2rem", margin: "0 0 6px 0" }}>{patient.full_name}</h2>
                  <span
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "3px 10px", borderRadius: 20,
                      fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                      background: patient.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                      color: patient.status === "active" ? "#10b981" : "#ef4444",
                      border: `1px solid ${patient.status === "active" ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                    {patient.status || "active"}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Phone size={18} color="var(--text-secondary)" />
                  <div>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block" }}>Mobile Number</span>
                    <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 500 }}>{patient.mobile_number}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Shield size={18} color="var(--text-secondary)" />
                  <div>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block" }}>Role</span>
                    <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 500, textTransform: "capitalize" }}>{patient.role}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Calendar size={18} color="var(--text-secondary)" />
                  <div>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block" }}>Enrolled On</span>
                    <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 500 }}>
                      {patient.created_at ? new Date(patient.created_at).toLocaleDateString() : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Graphical Trends */}
            <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
                <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px", margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <TrendingUp size={20} color="var(--accent-primary)" />
                  Clinical Score Trends
                </h3>
                <span className="hud-tag">Screening trends</span>
              </div>
              <div style={{ height: "300px", width: "100%" }}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPHQ9" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorGAD7" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", color: "var(--text-primary)" }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Area type="monotone" name="PHQ-9 (Depression)" dataKey="PHQ9" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorPHQ9)" />
                      <Area type="monotone" name="GAD-7 (Anxiety)" dataKey="GAD7" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#colorGAD7)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontStyle: "italic" }}>
                    No screening test results recorded for this user yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabular Test Results */}
          <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "10px", justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Heart size={20} color="var(--accent-primary)" />
                <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Historical Screening Tests</h3>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Test Date</th>
                    <th>PHQ-9 (Depression)</th>
                    <th>GAD-7 (Anxiety)</th>
                    <th>PQ-16 (Psychosis)</th>
                    <th>Suicide Flag (Item 9)</th>
                  </tr>
                </thead>
                <tbody>
                  {testResults.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                        No completed screenings found.
                      </td>
                    </tr>
                  ) : (
                    testResults.map((test: any) => (
                      <tr key={test._id}>
                        <td>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                            {new Date(test.createdAt).toLocaleString()}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: test.phq9_total >= 10 ? "var(--danger)" : "var(--success)" }}>
                            {test.phq9_total} / 27
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: test.gad7_total >= 10 ? "var(--warning)" : "var(--success)" }}>
                            {test.gad7_total} / 21
                          </span>
                        </td>
                        <td>{test.pq16_total} / 16</td>
                        <td>
                          {test.phq9_item9_flag ? (
                            <span className="badge badge-red" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <AlertTriangle size={12} /> Yes (Score: {test.phq9_item9_score})
                            </span>
                          ) : (
                            <span className="badge badge-green">No</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Dedicated Section: Daily Wellness Check-ins (Non-Diagnostic Telemetry) ── */}
          <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Smile size={20} color="var(--accent-primary)" />
                <div>
                  <h3 style={{ fontSize: "1.15rem", color: "var(--text-primary)", margin: 0, fontWeight: 700, letterSpacing: "-0.01em" }}>
                    Daily Wellness Check-ins
                  </h3>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                    Student-reported wellbeing check-ins — non-diagnostic (Past {dailyCheckinTelemetry?.lookbackDays || 14} days)
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="hud-tag">Daily check-ins</span>
                {dailyCheckinTelemetry && (
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Total Lifetime Check-ins: <strong style={{ color: "var(--text-primary)" }}>{dailyCheckinTelemetry.totalCheckins}</strong>
                  </span>
                )}
              </div>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {dailyCheckinTelemetry === undefined ? (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  Loading daily check-ins...
                </div>
              ) : dailyCheckinTelemetry.checkins.length === 0 ? (
                <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  No daily wellness check-ins recorded.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                  {dailyCheckinTelemetry.checkins.map((c: any) => {
                    const [y, m, d] = (c.dateStr || "").split("-").map(Number);
                    const formattedDate = (y && m && d)
                      ? new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                      : c.dateStr;
                    const timeStr = c.createdAt ? new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                    
                    return (
                      <div
                        key={c._id}
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                          padding: "12px 14px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            {formattedDate}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                            {timeStr}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "3px 10px",
                              borderRadius: "16px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              textTransform: "capitalize",
                              ...getMoodBadgeStyle(c.mood),
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                            {c.mood}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RENDER TAB: LONGITUDINAL CLINICAL TIMELINE */}
      {activeTab === "timeline" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <ClinicalTimelineView
            studentId={canonicalStudentId}
            maxHeight="750px"
            showHeader={true}
          />
        </div>
      )}

      {/* RENDER TAB: CARE JOURNEY (REQUESTS, APPOINTMENTS & FOLLOW-UPS) */}
      {activeTab === "care" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Care Pipeline Provenance Tracker (Factual) */}
          <div className="glass-panel" style={{ padding: "18px 24px", background: "rgba(255, 255, 255, 0.02)" }}>
            <h3 style={{ fontSize: "1.1rem", margin: "0 0 12px 0", color: "var(--text-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
              <Compass size={18} color="var(--accent-primary)" />
              Care Journey Pipeline
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "0.85rem" }}>
              <div style={{ padding: "6px 12px", borderRadius: "8px", background: "#f1f5f9", border: "1px solid #cbd5e1" }}>
                <strong>1. Screening:</strong> {testResults && testResults.length > 0 ? `PHQ-9: ${testResults[0].phq9_total}, GAD-7: ${testResults[0].gad7_total}` : "No tests"}
              </div>
              <span style={{ color: "var(--text-secondary)" }}>→</span>
              <div style={{ padding: "6px 12px", borderRadius: "8px", background: triageBg, border: `1px solid ${triageBorder}`, color: triageTextColor }}>
                <strong>2. Triage:</strong> {currentLevel.replace(/_/g, " ").toUpperCase()}
              </div>
              <span style={{ color: "var(--text-secondary)" }}>→</span>
              <div style={{ padding: "6px 12px", borderRadius: "8px", background: "#f8fafc", border: "1px solid var(--border-color)" }}>
                <strong>3. Request:</strong> {studentCounsellorRequests && studentCounsellorRequests.length > 0 ? studentCounsellorRequests[0].status || "pending" : "None"}
              </div>
              <span style={{ color: "var(--text-secondary)" }}>→</span>
              <div style={{ padding: "6px 12px", borderRadius: "8px", background: "#f8fafc", border: "1px solid var(--border-color)" }}>
                <strong>4. Appointment:</strong> {studentAppointments && studentAppointments.length > 0 ? `${studentAppointments[0].status} (${studentAppointments[0].date})` : "None"}
              </div>
              <span style={{ color: "var(--text-secondary)" }}>→</span>
              <div style={{ padding: "6px 12px", borderRadius: "8px", background: "#f8fafc", border: "1px solid var(--border-color)" }}>
                <strong>5. Follow-up:</strong> {studentFollowUps && studentFollowUps.length > 0 ? (studentFollowUps.some((f: any) => !f.completed) ? "Active pending" : "Completed") : "None"}
              </div>
            </div>
          </div>

          {/* Section 1: Counselor Requests */}
          <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <MessageSquare size={18} color="#06b6d4" />
                <h3 style={{ fontSize: "1.05rem", margin: 0, color: "var(--text-primary)", fontWeight: 700 }}>
                  Counselor Consultation Requests
                </h3>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {studentCounsellorRequests?.length ?? 0} request(s) recorded
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              {studentCounsellorRequests === undefined ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>Loading requests...</div>
              ) : studentCounsellorRequests.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>No counselor consultation requests recorded.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Request Date</th>
                      <th>Source Type</th>
                      <th>Status</th>
                      <th>Originating Triage / Attempt</th>
                      <th>Counselor Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentCounsellorRequests.map((req: any) => (
                      <tr key={req._id}>
                        <td>{new Date(req.timestamp).toLocaleString()}</td>
                        <td>
                          <span style={{ textTransform: "capitalize" }}>
                            {(req.sourceType || "self_initiated").replace(/_/g, " ")}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${req.status === 'completed' ? 'badge-green' : req.status === 'scheduled' ? 'badge-purple' : 'badge-orange'}`}>
                            {req.status || "pending"}
                          </span>
                        </td>
                        <td>
                          {req.triageId ? (
                            <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#8b5cf6" }}>
                              Triage #{String(req.triageId).slice(-6)}
                            </span>
                          ) : req.attemptId ? (
                            <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)", color: "var(--accent-primary)" }}>
                              Attempt #{String(req.attemptId).slice(-6)}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Direct</span>
                          )}
                        </td>
                        <td style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {req.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Section 2: Appointments */}
          <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Calendar size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: "1.05rem", margin: 0, color: "var(--text-primary)", fontWeight: 700 }}>
                  Appointments & Consultations
                </h3>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {studentAppointments?.length ?? 0} appointment(s)
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              {studentAppointments === undefined ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>Loading appointments...</div>
              ) : studentAppointments.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>No appointments scheduled or recorded.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Date & Time</th>
                      <th>Status</th>
                      <th>Provenance</th>
                      <th>Attended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentAppointments.map((appt: any) => (
                      <tr key={appt._id}>
                        <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{appt.title}</td>
                        <td>{appt.date} at {appt.time}</td>
                        <td>
                          <span className={`badge ${appt.status === 'accepted' ? 'badge-green' : appt.status === 'completed' ? 'badge-purple' : appt.status === 'rejected' || appt.status === 'cancelled' ? 'badge-red' : 'badge-orange'}`}>
                            {appt.status}
                          </span>
                        </td>
                        <td>
                          {appt.counsellorRequestId ? (
                            <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.25)", color: "#0891b2" }}>
                              From Request #{String(appt.counsellorRequestId).slice(-6)}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Direct</span>
                          )}
                        </td>
                        <td>{appt.attended ? appt.attended.toUpperCase() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Section 3: Care Follow-ups */}
          <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckSquare size={18} color="#10b981" />
                <h3 style={{ fontSize: "1.05rem", margin: 0, color: "var(--text-primary)", fontWeight: 700 }}>
                  Care Follow-ups
                </h3>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {studentFollowUps?.length ?? 0} follow-up(s)
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              {studentFollowUps === undefined ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>Loading follow-ups...</div>
              ) : studentFollowUps.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>No follow-ups recorded.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Originating Appointment</th>
                      <th>Staff Notes</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentFollowUps.map((fu: any) => (
                      <tr key={fu._id}>
                        <td style={{ textTransform: "capitalize", fontWeight: 600, color: "var(--text-primary)" }}>
                          {fu.type.replace(/_/g, " ")}
                        </td>
                        <td>{new Date(fu.dueDate).toLocaleDateString()}</td>
                        <td>
                          {fu.status === "completed" || fu.completed ? (
                            <span className="badge badge-green">Completed</span>
                          ) : (
                            <span className="badge" style={{ background: "rgba(234, 179, 8, 0.15)", color: "#ca8a04", border: "1px solid rgba(234, 179, 8, 0.3)" }}>Pending</span>
                          )}
                        </td>
                        <td>
                          {fu.appointmentId ? (
                            <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", color: "var(--accent-primary)" }}>
                              Appointment #{String(fu.appointmentId).slice(-6)}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Standalone</span>
                          )}
                        </td>
                        <td style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {fu.notes || "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {fu.status !== "completed" && !fu.completed ? (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: "4px 10px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              onClick={() => handleMarkFollowUpComplete(fu._id)}
                              disabled={completingFollowUpId === String(fu._id)}
                            >
                              <CheckSquare size={13} /> {completingFollowUpId === String(fu._id) ? "..." : "Complete"}
                            </button>
                          ) : (
                            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                              Done {fu.completedAt ? new Date(fu.completedAt).toLocaleDateString() : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RENDER TAB 2: AI CBT THERAPY ANALYTICS */}
      {activeTab === "cbt" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {cbtAnalytics === null ? (
            <div style={{ minHeight: "200px", display: "flex", alignItems: "center", justifyContent: "center", fontStyle: "italic", color: "var(--text-secondary)" }}>
              No CBT therapy analytics or history registered for this student yet.
            </div>
          ) : (
            <>
              {/* CBT STATS SUMMARY CARDS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
                <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "20px" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Total CBT Sessions</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Brain size={24} color="#6366f1" />
                    <span style={{ fontSize: "1.8rem", fontWeight: 750, color: "var(--text-primary)" }}>{cbtAnalytics.totalCbtSessions}</span>
                  </div>
                </div>

                <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "20px" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Avg Tension Reduction</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Smile size={24} color="#10b981" />
                    <span style={{ fontSize: "1.8rem", fontWeight: 750, color: "var(--success)" }}>
                      {cbtAnalytics.emotionImprovement > 0 ? `-${cbtAnalytics.emotionImprovement}` : "0"}
                    </span>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>pts (0-10)</span>
                  </div>
                </div>

                <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "20px" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Reframe Belief Score</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <CheckCircle size={24} color="#3b82f6" />
                    <span style={{ fontSize: "1.8rem", fontWeight: 750, color: "var(--text-primary)" }}>{cbtAnalytics.beliefImprovement}%</span>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>avg belief</span>
                  </div>
                </div>

                <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "20px" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Goal Activation Rate</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Award size={24} color="#f59e0b" />
                    <span style={{ fontSize: "1.8rem", fontWeight: 750, color: "var(--text-primary)" }}>{cbtAnalytics.goalCompletionRate}%</span>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>completion</span>
                  </div>
                </div>
              </div>

              {/* CBT DUAL CHARTS */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                {/* Acute Session Tension Delta Chart */}
                <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <h3 style={{ fontSize: "1.1rem", margin: 0, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <TrendingUp size={18} color="var(--accent-primary)" />
                    Acute Session Tension Delta (Pre vs Post Exercise)
                  </h3>
                  <div style={{ height: "260px", width: "100%" }}>
                    {cbtAnalytics.recoveryTrend.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cbtAnalytics.recoveryTrend} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorBefore" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorAfter" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} domain={[0, 10]} />
                          <Tooltip
                            contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", color: "var(--text-primary)" }}
                          />
                          <Legend verticalAlign="top" height={36} />
                          <Area type="monotone" name="Emotion Before" dataKey="emotionBefore" stroke="#f43f5e" strokeWidth={2.5} fillOpacity={1} fill="url(#colorBefore)" />
                          <Area type="monotone" name="Emotion After" dataKey="emotionAfter" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAfter)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontStyle: "italic" }}>
                        Not enough data points yet.
                      </div>
                    )}
                  </div>
                </div>

                {/* Thinking Style Frequencies */}
                <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <h3 style={{ fontSize: "1.1rem", margin: 0, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Brain size={18} color="var(--accent-primary)" />
                    Thinking Styles Frequency
                  </h3>
                  <div style={{ height: "260px", width: "100%" }}>
                    {thinkingTrapChartData.some(d => d.Sessions > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={thinkingTrapChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", color: "var(--text-primary)" }}
                          />
                          <Bar dataKey="Sessions" radius={[6, 6, 0, 0]}>
                            {thinkingTrapChartData.map((entry, idx) => (
                              <Cell key={`cell-${idx}`} fill={barColors[idx % barColors.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontStyle: "italic" }}>
                        No thinking traps logged yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* BEHAVIOURAL ACTIVATION & MICRO-GOALS SUMMARY */}
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <Award size={20} color="var(--accent-primary)" />
                    Behavioral Activation & Micro-Goals
                  </h3>
                  <span className="hud-tag" style={{ background: "rgba(16, 185, 129, 0.1)", color: "var(--success)" }}>ACTIVATION</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                  <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px" }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>Action Plans Created</span>
                    <span style={{ fontSize: "1.6rem", fontWeight: 750, color: "var(--text-primary)" }}>{cbtAnalytics.recoveryPlansCount}</span>
                  </div>
                  <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px" }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>Frequently Completed Goal</span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--success)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cbtAnalytics.frequentlyCompletedGoals?.[0]?.title || "None yet"}
                    </span>
                  </div>
                  <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "16px" }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>Frequently Skipped Goal</span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--danger)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cbtAnalytics.frequentlySkippedGoals?.[0]?.title || "None yet"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px" }}>
                  {/* BA Trends Chart */}
                  <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <h4 style={{ fontSize: "1.0rem", margin: 0, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <TrendingUp size={16} color="var(--accent-primary)" />
                      14-Day Goal Completion Activity
                    </h4>
                    <div style={{ height: "230px", width: "100%" }}>
                      {cbtAnalytics.behaviouralActivationTrends.some((t: any) => t.total > 0) ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={cbtAnalytics.behaviouralActivationTrends} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="date" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
                            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", color: "var(--text-primary)" }} />
                            <Legend verticalAlign="top" height={36} />
                            <Bar name="Goals Scheduled" dataKey="total" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                            <Bar name="Goals Completed" dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontStyle: "italic" }}>
                          No goals scheduled in the last 14 days.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Frequently Completed / Skipped list */}
                  <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div>
                      <h4 style={{ fontSize: "0.95rem", margin: "0 0 8px 0", color: "var(--text-primary)" }}>🔥 Top Completed Goal Categories</h4>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {cbtAnalytics.mostEffectiveGoalCategories.length === 0 ? (
                          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", fontStyle: "italic" }}>No categories tracked yet.</span>
                        ) : (
                          cbtAnalytics.mostEffectiveGoalCategories.slice(0, 4).map((cat: any) => (
                            <span key={cat.category} className="badge badge-green" style={{ fontSize: "0.8rem", padding: "4px 8px" }}>
                              {cat.category}: {cat.count}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "12px" }}>
                      <h4 style={{ fontSize: "0.95rem", margin: "0 0 8px 0", color: "var(--text-primary)" }}>⚠️ Frequently Skipped Micro-Goals</h4>
                      <ul style={{ margin: 0, paddingLeft: "16px", color: "var(--text-secondary)", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "4px" }}>
                        {cbtAnalytics.frequentlySkippedGoals.length === 0 ? (
                          <li style={{ fontStyle: "italic", listStyleType: "none", marginLeft: "-16px" }}>No goals skipped yet.</li>
                        ) : (
                          cbtAnalytics.frequentlySkippedGoals.slice(0, 3).map((g: any, idx: number) => (
                            <li key={idx} style={{ color: "var(--text-primary)" }}>
                              "{g.title}" <strong style={{ color: "var(--danger)" }}>({g.count} skips)</strong>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* HIGH RISK TRIGGERS */}
              {cbtAnalytics.highRiskAlerts.length > 0 && (
                <div className="glass-panel hud-panel" style={{ borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <h3 style={{ fontSize: "1.1rem", margin: 0, color: "var(--danger)", display: "flex", alignItems: "center", gap: "8px" }}>
                    <AlertTriangle size={18} /> High-Risk Safety Mode Activations ({cbtAnalytics.highRiskAlerts.length})
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {cbtAnalytics.highRiskAlerts.map((alert: any, idx: number) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255, 255, 255, 0.8)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "8px" }}>
                        <div>
                          <span style={{ fontWeight: 650, color: "var(--text-primary)" }}>Session Triggered: {alert.situation}</span>
                          <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                            {alert.riskFlags.map((flag: string) => (
                              <span key={flag} className="badge badge-red" style={{ fontSize: "0.75rem", padding: "2px 6px" }}>{flag}</span>
                            ))}
                          </div>
                        </div>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", alignSelf: "center" }}>
                          {new Date(alert.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* HISTORICAL CBT SESSIONS LIST */}
              <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "10px" }}>
                  <Brain size={20} color="var(--accent-primary)" />
                  <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Historical AI CBT Sessions</h3>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Core Thought</th>
                        <th>Trap Style</th>
                        <th>CBT distortion</th>
                        <th>Tension Delta</th>
                        <th>Reframe belief</th>
                        <th>Status</th>
                        <th style={{ textAlign: "right" }}>Dialogue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cbtAnalytics.sessionsHistory.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: "center", padding: "30px", color: "var(--text-secondary)" }}>
                            No CBT sessions logged for this student.
                          </td>
                        </tr>
                      ) : (
                        cbtAnalytics.sessionsHistory.map((s: any) => (
                          <tr key={s._id}>
                            <td>{new Date(s.timestamp).toLocaleDateString()}</td>
                            <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              <span style={{ fontWeight: 550, color: "var(--text-primary)" }}>"{s.automaticThought || "N/A"}"</span>
                            </td>
                            <td>{s.thinkingStyle || "N/A"}</td>
                            <td>{s.cbtDistortion ? <span className="badge badge-purple">{s.cbtDistortion}</span> : "N/A"}</td>
                            <td>
                              {s.emotionBefore !== undefined && s.emotionAfter !== undefined ? (
                                <span style={{ fontWeight: 600, color: s.emotionBefore > s.emotionAfter ? "var(--success)" : "var(--text-secondary)" }}>
                                  {s.emotionBefore} → {s.emotionAfter} (-{s.emotionBefore - s.emotionAfter})
                                </span>
                              ) : "N/A"}
                            </td>
                            <td>{s.beliefScore !== undefined ? `${s.beliefScore}%` : "N/A"}</td>
                            <td>
                              <span className={`badge ${s.sessionStatus === "completed" ? "badge-green" : s.sessionStatus === "safety_mode" ? "badge-red" : "badge-orange"}`}>
                                {s.sessionStatus}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: "4px 10px", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                onClick={() => setSelectedSession(s)}
                              >
                                <MessageSquare size={12} /> View transcript
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* RENDER TAB 3: SOMATIC & JPMR TELEMETRY */}
      {(activeTab as string) === "somatic" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

          <div className="grid-2">
            {/* JPMR Relaxation Logs */}
            <div className="glass-panel hud-panel">
              <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
                <Heart size={20} color="var(--accent-primary)" /> JPMR Relaxation Sessions
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table className="hud-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>
                      <th style={{ padding: "12px 16px" }}>Date</th>
                      <th style={{ padding: "12px 16px" }}>Duration</th>
                      <th style={{ padding: "12px 16px" }}>Pre Intensity</th>
                      <th style={{ padding: "12px 16px" }}>Post Intensity</th>
                      <th style={{ padding: "12px 16px" }}>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cbtAnalytics?.jpmrLogs && cbtAnalytics.jpmrLogs.length > 0 ? (
                      cbtAnalytics.jpmrLogs.map((j: any) => {
                        const delta = j.preIntensity - j.postIntensity;
                        return (
                          <tr key={j._id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                            <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>{new Date(j.createdAt).toLocaleDateString()}</td>
                            <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>{j.durationSeconds ? `${Math.round(j.durationSeconds / 60)} min` : "N/A"}</td>
                            <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "var(--danger)", fontWeight: 600 }}>{j.preIntensity}/10</td>
                            <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "var(--success)", fontWeight: 600 }}>{j.postIntensity}/10</td>
                            <td style={{ padding: "12px 16px", fontSize: "0.85rem", fontWeight: 700, color: delta > 0 ? "var(--success)" : "var(--text-secondary)" }}>
                              {delta > 0 ? `-${delta} pts` : "0"}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>No JPMR logs recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Emotion Body Maps */}
            <div className="glass-panel hud-panel">
              <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
                <Brain size={20} color="var(--accent-primary)" /> Emotion Body Maps
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "320px", overflowY: "auto" }}>
                {cbtAnalytics?.emotionMaps && cbtAnalytics.emotionMaps.length > 0 ? (
                  cbtAnalytics.emotionMaps.map((em: any) => (
                    <div key={em._id} style={{ padding: "14px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>{em.emotionLabel}</span>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{new Date(em.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "#475569" }}>
                        Regions: <strong>{em.selectedRegions?.join(", ") || "None"}</strong> • Avg Intensity: <strong>{em.averageIntensity}/10</strong>
                      </p>
                      {em.suggestedAction && (
                        <span style={{ fontSize: "0.8rem", color: "var(--accent-primary)", fontStyle: "italic" }}>Suggested: {em.suggestedAction}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ color: "var(--text-secondary)", textAlign: "center", margin: "20px 0" }}>No Emotion Body Maps logged.</p>
                )}
              </div>
            </div>
          </div>

          {/* Breathing Sessions */}
          <div className="glass-panel hud-panel">
            <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
              <Wind size={20} color="var(--accent-primary)" /> Breathing Sessions
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table className="hud-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>
                    <th style={{ padding: "12px 16px" }}>Date</th>
                    <th style={{ padding: "12px 16px" }}>Protocol</th>
                    <th style={{ padding: "12px 16px" }}>Duration</th>
                    <th style={{ padding: "12px 16px" }}>Cycles Completed</th>
                    <th style={{ padding: "12px 16px" }}>Status</th>
                    <th style={{ padding: "12px 16px" }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {cbtAnalytics?.breathingLogs && cbtAnalytics.breathingLogs.length > 0 ? (
                    cbtAnalytics.breathingLogs.map((b: any) => (
                      <tr key={b._id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>
                          {new Date(b.createdAt).toLocaleDateString()} {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", fontWeight: 600 }}>{b.protocolName}</td>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>{b.durationSeconds ? `${b.durationSeconds}s` : "N/A"}</td>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", fontWeight: 600 }}>{b.cyclesCompleted} / {b.targetCycles}</td>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: b.status === "completed" ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                            color: b.status === "completed" ? "var(--success)" : "var(--warning)",
                          }}>
                            {b.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{b.sourceType}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>No Breathing sessions recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sensory Grounding Sessions */}
          <div className="glass-panel hud-panel">
            <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
              <Compass size={20} color="var(--accent-primary)" /> 5-4-3-2-1 Sensory Grounding Sessions
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table className="hud-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>
                    <th style={{ padding: "12px 16px" }}>Date</th>
                    <th style={{ padding: "12px 16px" }}>Duration</th>
                    <th style={{ padding: "12px 16px" }}>Steps</th>
                    <th style={{ padding: "12px 16px" }}>Status</th>
                    <th style={{ padding: "12px 16px" }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {cbtAnalytics?.groundingLogs && cbtAnalytics.groundingLogs.length > 0 ? (
                    cbtAnalytics.groundingLogs.map((g: any) => (
                      <tr key={g._id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>{new Date(g.createdAt).toLocaleDateString()} {new Date(g.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>{g.durationSeconds ? `${g.durationSeconds}s` : "N/A"}</td>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", fontWeight: 600 }}>{g.stepsCompleted} / {g.totalSteps || 5}</td>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem" }}>
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: g.status === "completed" ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                            color: g.status === "completed" ? "var(--success)" : "var(--warning)",
                          }}>
                            {g.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{g.sourceType}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>No Sensory Grounding sessions recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RENDER TAB 4: GAMIFICATION & REFRAMES */}
      {(activeTab as string) === "gamification" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {/* Gamification Summary Stats Header */}
          <div className="grid-3">
            <div className="glass-panel hud-panel" style={{ borderTop: "2px solid var(--accent-primary)" }}>
              <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: 700 }}>Level & XP</span>
              <p style={{ fontSize: "2.2rem", fontWeight: 800, margin: "8px 0 0 0" }}>Lvl {cbtAnalytics?.level || 1} <span style={{ fontSize: "1.1rem", fontWeight: 500, color: "var(--text-secondary)" }}>({cbtAnalytics?.xp || 0} XP)</span></p>
            </div>
            <div className="glass-panel hud-panel" style={{ borderTop: "2px solid var(--success)" }}>
              <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: 700 }}>Current Streak</span>
              <p style={{ fontSize: "2.2rem", fontWeight: 800, margin: "8px 0 0 0", color: "var(--success)" }}>{cbtAnalytics?.streak?.currentStreak || 0} Days</p>
            </div>
            <div className="glass-panel hud-panel" style={{ borderTop: "2px solid var(--warning)" }}>
              <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: 700 }}>Earned Badges</span>
              <p style={{ fontSize: "2.2rem", fontWeight: 800, margin: "8px 0 0 0", color: "var(--warning)" }}>{cbtAnalytics?.badges?.length || 0} Badges</p>
            </div>
          </div>

          {/* Guided Cognitive Reframes History Table */}
          <div className="glass-panel hud-panel">
            <h3 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
              <Smile size={20} color="var(--accent-primary)" /> Guided Cognitive Reframes Log
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table className="hud-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: "0.8rem", color: "#64748b", textTransform: "uppercase" }}>
                    <th style={{ padding: "12px 16px" }}>Date</th>
                    <th style={{ padding: "12px 16px" }}>Situation & Original Thought</th>
                    <th style={{ padding: "12px 16px" }}>Thinking Trap</th>
                    <th style={{ padding: "12px 16px" }}>New Reframed Thought</th>
                    <th style={{ padding: "12px 16px" }}>Improvement</th>
                  </tr>
                </thead>
                <tbody>
                  {cbtAnalytics?.reframeLogs && cbtAnalytics.reframeLogs.length > 0 ? (
                    cbtAnalytics.reframeLogs.map((rf: any) => (
                      <tr key={rf._id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", whiteSpace: "nowrap" }}>{new Date(rf.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: "12px 16px", fontSize: "0.88rem" }}>
                          <span style={{ fontWeight: 600, display: "block" }}>{rf.situation_text}</span>
                          <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>"{rf.thought_original}"</span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span className="badge badge-orange" style={{ fontSize: "0.75rem" }}>{rf.thinking_trap_choice}</span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: "0.88rem", color: "var(--accent-primary)", fontWeight: 600 }}>"{rf.reframe_text}"</td>
                        <td style={{ padding: "12px 16px", fontSize: "0.88rem", fontWeight: 700, color: "var(--success)" }}>
                          +{rf.improvement_percentage}%
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>No guided reframe logs recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* DIALOGUE TRANSCRIPT VIEWER MODAL */}
      {selectedSession && createPortal(
        <div style={overlayStyle} onClick={() => setSelectedSession(null)}>
          <div className="glass-panel animate-fade-in" style={{ ...modalStyle, maxWidth: "750px", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div>
                <h2 style={{ fontSize: "1.4rem", margin: "0 0 4px 0", color: "var(--text-primary)" }}>CBT Session Dialogue Transcript</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
                  Date: {new Date(selectedSession.timestamp).toLocaleString()} • Status: <span style={{ fontWeight: 600 }}>{selectedSession.sessionStatus}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="btn btn-secondary"
                style={{ padding: "6px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "0.9rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}
              >
                ✕ Close
              </button>
            </div>

            {/* Session Clinical Summary Section */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", padding: "16px", background: "rgba(0,0,0,0.02)", border: "1px solid var(--border-color)", borderRadius: "12px", marginBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Situation Analyzed</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>{selectedSession.situation || "Unknown"}</span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Cognitive Distortion (Internal)</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 600 }}>{selectedSession.cbtDistortion || "N/A"}</span>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Automatic Thought</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontStyle: "italic" }}>"{selectedSession.automaticThought || "N/A"}"</span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Thinking Style</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>{selectedSession.thinkingStyle || "N/A"}</span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Reframe Balanced Thought</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 550 }}>"{selectedSession.balancedThought || "N/A"}"</span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Belief Rating</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 600 }}>{selectedSession.beliefScore !== undefined ? `${selectedSession.beliefScore}%` : "N/A"}</span>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Recommended Goals in Action Plan</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>
                  {selectedSession.recommendedGoals && selectedSession.recommendedGoals.length > 0 ? (
                    <ul style={{ margin: "4px 0 0 0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "2px" }}>
                      {selectedSession.recommendedGoals.map((g: any) => {
                        const isChosen = selectedSession.selectedGoalIds?.includes(g.id);
                        return (
                          <li key={g.id} style={{ color: isChosen ? "var(--success)" : "var(--text-secondary)", fontWeight: isChosen ? 600 : 400 }}>
                            {g.title} {isChosen && "✓ (Selected)"}
                          </li>
                        );
                      })}
                    </ul>
                  ) : selectedSession.recommendedGoal ? (
                    `🎯 ${selectedSession.recommendedGoal.title} ${selectedSession.goalCompletion ? "(Accepted)" : "(Skipped)"}`
                  ) : (
                    "None"
                  )}
                </span>
              </div>
            </div>

            {/* Chat Transcript Panel */}
            <h3 style={{ fontSize: "1.1rem", margin: "16px 0 8px 0", color: "var(--text-primary)" }}>Counselor Dialogue Log</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", border: "1px solid var(--border-color)", borderRadius: "12px", background: "#f8fafc" }}>
              {selectedSession.conversation && selectedSession.conversation.length > 0 ? (
                selectedSession.conversation.map((msg: any, idx: number) => {
                  const isUser = msg.role === "user";
                  return (
                    <div key={idx} style={{
                      alignSelf: isUser ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      background: isUser ? "var(--accent-primary)" : "#ffffff",
                      border: isUser ? "none" : "1px solid #cbd5e1",
                      color: isUser ? "white" : "#1e293b",
                      borderRadius: "14px",
                      padding: "10px 16px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                    }}>
                      <strong style={{ display: "block", fontSize: "0.75rem", color: isUser ? "rgba(255,255,255,0.85)" : "#64748b", marginBottom: "3px" }}>
                        {isUser ? "Student" : "Compassionate AI Counselor"}
                      </strong>
                      <span style={{ fontSize: "0.95rem", lineHeight: 1.45 }}>{msg.content}</span>
                    </div>
                  );
                })
              ) : (
                <p style={{ color: "var(--text-secondary)", textAlign: "center", margin: "auto" }}>No transcript messages recorded for this session.</p>
              )}
            </div>


            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
              <button className="btn btn-secondary" onClick={() => setSelectedSession(null)} style={{ padding: "8px 20px", fontWeight: 650 }}>
                Close Transcript
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* UNBLOCK PATIENT ACTION MODAL */}
      {showUnblockModal && createPortal(
        <div style={overlayStyle} onClick={() => !isSubmittingUnblock && setShowUnblockModal(false)}>
          <div className="glass-panel animate-fade-in" style={{ ...modalStyle, maxWidth: "550px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ padding: "8px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>
                  <Unlock size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: "1.3rem", margin: 0, color: "var(--text-primary)" }}>Triage actions</h3>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Student: <strong>{patient.full_name}</strong></span>
                </div>
              </div>
              <button
                className="btn btn-secondary"
                disabled={isSubmittingUnblock}
                onClick={() => setShowUnblockModal(false)}
                style={{ padding: "4px 10px", fontSize: "0.85rem" }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: "8px 0 16px 0", lineHeight: 1.5 }}>
              Choose an action to update the student’s triage status and app access after counsellor review:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Option 1: Switch to Moderate */}
              <button
                disabled={isSubmittingUnblock}
                onClick={() => handleUnblockAction("switch_moderate")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid #f97316",
                  background: "rgba(249, 115, 22, 0.05)",
                  cursor: isSubmittingUnblock ? "not-allowed" : "pointer",
                  textAlign: "left",
                  transition: "all 0.2s ease"
                }}
              >
                <div>
                  <strong style={{ fontSize: "1.0rem", color: "#c2410c", display: "block" }}>1) Switch to Moderate</strong>
                  <span style={{ fontSize: "0.85rem", color: "#9a3412" }}>Set triage status to Moderate level and enable guided app features.</span>
                </div>
                <ArrowRight size={18} color="#f97316" />
              </button>

              {/* Option 2: Switch to Low */}
              <button
                disabled={isSubmittingUnblock}
                onClick={() => handleUnblockAction("switch_low")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid #10b981",
                  background: "rgba(16, 185, 129, 0.05)",
                  cursor: isSubmittingUnblock ? "not-allowed" : "pointer",
                  textAlign: "left",
                  transition: "all 0.2s ease"
                }}
              >
                <div>
                  <strong style={{ fontSize: "1.0rem", color: "#047857", display: "block" }}>2) Switch to Low (Mild)</strong>
                  <span style={{ fontSize: "0.85rem", color: "#065f46" }}>Set triage status to Low/Mild risk and grant full app access.</span>
                </div>
                <ArrowRight size={18} color="#10b981" />
              </button>

              {/* Option 3: Forced to another screening test */}
              <button
                disabled={isSubmittingUnblock}
                onClick={() => handleUnblockAction("force_retest")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid #6366f1",
                  background: "rgba(99, 102, 241, 0.05)",
                  cursor: isSubmittingUnblock ? "not-allowed" : "pointer",
                  textAlign: "left",
                  transition: "all 0.2s ease"
                }}
              >
                <div>
                  <strong style={{ fontSize: "1.0rem", color: "#4338ca", display: "block" }}>3) Forced Retest (New Screening)</strong>
                  <span style={{ fontSize: "0.85rem", color: "#3730a3" }}>Require the patient to take a mandatory new clinical assessment test.</span>
                </div>
                <RefreshCw size={18} color="#6366f1" />
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
              <button
                className="btn btn-secondary"
                disabled={isSubmittingUnblock}
                onClick={() => setShowUnblockModal(false)}
                style={{ padding: "8px 18px", fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Custom Trigger Screening Modal ── */}
      {showTriggerModal && createPortal(
        <div style={overlayStyle} onClick={() => !isTriggeringTest && setShowTriggerModal(false)}>
          <div style={{ ...modalStyle, maxWidth: 450 }} onClick={(e) => e.stopPropagation()}>
            {triggerSuccessMsg ? (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#ecfdf5", border: "1px solid #a7f3d0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto", color: "#10b981" }}>
                  <CheckCircle size={32} />
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-primary)" }}>
                  Screening Triggered!
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, margin: "0 0 24px 0" }}>
                  A mandatory new screening assessment has been forced for <strong>{patient.full_name}</strong>. Their mobile app will immediately prompt them to complete the test.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowTriggerModal(false)}
                  style={{ width: "100%", padding: "10px 0", fontWeight: 600, borderRadius: 10 }}
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366f1" }}>
                    <RefreshCw size={22} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                      Force New Screening Test?
                    </h3>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      Clinical Action for {patient.full_name}
                    </span>
                  </div>
                </div>

                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: 24 }}>
                  Are you sure you want to force a new clinical screening test for <strong>{patient.full_name}</strong>? This will lock their app tools until they complete the re-assessment.
                </p>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    className="btn btn-secondary"
                    disabled={isTriggeringTest}
                    onClick={() => setShowTriggerModal(false)}
                    style={{ padding: "9px 18px", borderRadius: 10, fontWeight: 600 }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={isTriggeringTest}
                    onClick={confirmAndTriggerScreening}
                    style={{ padding: "9px 20px", borderRadius: 10, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    {isTriggeringTest ? <RefreshCw size={16} className="animate-spin" /> : null}
                    {isTriggeringTest ? "Triggering..." : "Confirm & Trigger"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(14px)",
  zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};

const modalStyle: React.CSSProperties = {
  position: "relative", width: "100%", padding: "32px", borderRadius: 20,
  background: "var(--card-bg)", display: "flex", flexDirection: "column", gap: 16,
};
