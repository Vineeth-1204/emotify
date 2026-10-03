import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Clock, Shield, AlertTriangle, Brain, Heart, Activity, FileText,
  Calendar, ChevronDown, ChevronUp, Link as LinkIcon,
  MessageSquare, RefreshCw
} from "lucide-react";
import { ClinicalBadge } from "./ClinicalBadge";

export type TimelineCategoryFilter =
  | "all"
  | "screening"
  | "triage"
  | "safety"
  | "counseling"
  | "intervention"
  | "monitoring"
  | "note";

interface ClinicalTimelineViewProps {
  studentId: string;
  maxHeight?: string;
  showHeader?: boolean;
}

const CATEGORY_TABS: { key: TimelineCategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "screening", label: "Screening" },
  { key: "triage", label: "Triage" },
  { key: "safety", label: "Safety" },
  { key: "counseling", label: "Counseling" },
  { key: "intervention", label: "Intervention" },
  { key: "monitoring", label: "Monitoring" },
  { key: "note", label: "Notes" },
];

function getCategoryIcon(category: string) {
  switch (category) {
    case "screening":
      return <FileText size={16} color="var(--accent-primary, #3b82f6)" />;
    case "triage":
      return <Shield size={16} color="#8b5cf6" />;
    case "safety":
      return <AlertTriangle size={16} color="var(--danger, #ef4444)" />;
    case "counseling":
      return <Calendar size={16} color="#06b6d4" />;
    case "intervention":
      return <Brain size={16} color="#10b981" />;
    case "monitoring":
      return <Activity size={16} color="#f59e0b" />;
    case "note":
      return <MessageSquare size={16} color="#ec4899" />;
    default:
      return <Clock size={16} color="var(--text-secondary, #64748b)" />;
  }
}

function getSeverityBadge(severity?: string) {
  if (!severity || severity === "normal") return null;
  const sev = severity.toLowerCase();
  if (sev === "critical" || sev === "severe") {
    return <ClinicalBadge level="severe" size="sm" pulse />;
  }
  if (sev === "moderate") {
    return <ClinicalBadge level="moderate" size="sm" />;
  }
  if (sev === "mild" || sev === "low") {
    return <ClinicalBadge level="low" size="sm" />;
  }
  return null;
}

export const ClinicalTimelineView: React.FC<ClinicalTimelineViewProps> = ({
  studentId,
  maxHeight = "600px",
  showHeader = true,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<TimelineCategoryFilter>("all");
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  // Query parameter: pass undefined when 'all' to avoid loading high-frequency monitoring noise
  const categoryFilterArg =
    selectedCategory === "all"
      ? undefined
      : (selectedCategory as "screening" | "triage" | "safety" | "counseling" | "intervention" | "monitoring" | "note");

  const timelineResult = useQuery(
    api.timeline.getStudentClinicalTimeline,
    studentId
      ? {
          userId: studentId,
          categoryFilter: categoryFilterArg,
          limit: 100,
        }
      : "skip"
  );

  const timelineEvents =
    timelineResult === undefined
      ? undefined
      : Array.isArray(timelineResult)
      ? timelineResult
      : (timelineResult as any)?.events;

  const toggleExpand = (id: string) => {
    setExpandedEvents((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="glass-panel hud-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Header and Title */}
      {showHeader && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Clock size={20} color="var(--accent-primary)" />
            <h3 style={{ fontSize: "1.15rem", margin: 0, color: "var(--text-primary)", fontWeight: 700 }}>
              Longitudinal Clinical Timeline
            </h3>
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
            Authoritative dynamic read model · Provenance-linked
          </span>
        </div>
      )}

      {/* Category Filter Pills */}
      <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px" }}>
        {CATEGORY_TABS.map((tab) => {
          const isActive = selectedCategory === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSelectedCategory(tab.key)}
              style={{
                padding: "6px 12px",
                borderRadius: "20px",
                border: isActive ? "1px solid var(--accent-primary)" : "1px solid var(--border-color)",
                background: isActive ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.02)",
                color: isActive ? "var(--accent-primary)" : "var(--text-secondary)",
                fontWeight: isActive ? 700 : 500,
                fontSize: "0.8rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Timeline Stream */}
      <div style={{ maxHeight, overflowY: "auto", paddingRight: "6px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Loading State */}
        {timelineEvents === undefined && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", color: "var(--text-secondary)", gap: "10px" }}>
            <RefreshCw size={24} className="animate-spin" color="var(--accent-primary)" />
            <span style={{ fontSize: "0.88rem" }}>Loading clinical timeline events...</span>
          </div>
        )}

        {/* Empty State */}
        {timelineEvents !== undefined && timelineEvents.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 16px", textAlign: "center", border: "1px dashed var(--border-color)", borderRadius: "12px", background: "rgba(255,255,255,0.01)" }}>
            <Clock size={32} style={{ color: "var(--text-secondary)", marginBottom: "8px", opacity: 0.6 }} />
            <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px 0" }}>
              No clinical timeline events yet.
            </h4>
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0, maxWidth: "340px" }}>
              {selectedCategory === "all"
                ? "No clinical, triage, safety, or counseling events have been recorded for this student."
                : `No events recorded under category "${selectedCategory}".`}
            </p>
          </div>
        )}

        {/* Events Rendering */}
        {timelineEvents !== undefined && timelineEvents.length > 0 && (
          <div style={{ position: "relative", paddingLeft: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Timeline Vertical Rail */}
            <div
              style={{
                position: "absolute",
                top: "14px",
                bottom: "14px",
                left: "9px",
                width: "2px",
                background: "var(--border-color)",
                opacity: 0.7,
              }}
            />

            {timelineEvents.map((event: any) => {
              const isExpanded = !!expandedEvents[event.id];
              const dateStr = new Date(event.occurredAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });

              return (
                <div
                  key={event.id}
                  style={{
                    position: "relative",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    transition: "border-color 0.15s ease",
                  }}
                >
                  {/* Timeline Bullet Node */}
                  <div
                    style={{
                      position: "absolute",
                      left: "-20px",
                      top: "16px",
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      background: "var(--surface-card, #ffffff)",
                      border: "2px solid var(--accent-primary)",
                      boxShadow: "0 0 0 3px rgba(37,99,235,0.15)",
                    }}
                  />

                  {/* Header Row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center" }}>
                        {getCategoryIcon(event.category)}
                      </span>
                      <strong style={{ fontSize: "0.92rem", color: "var(--text-primary)" }}>
                        {event.title}
                      </strong>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "2px 7px",
                          borderRadius: "10px",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {event.category}
                      </span>
                      {getSeverityBadge(event.severity)}
                      {event.status && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: "6px",
                            background: "rgba(100,116,139,0.12)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {event.status}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {dateStr}
                    </span>
                  </div>

                  {/* Event Summary */}
                  <p style={{ margin: "6px 0 0 0", fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                    {event.summary}
                  </p>

                  {/* Provenance Badges (Only displayed when explicit provenance exists) */}
                  {event.provenance && (event.provenance.attemptId || event.provenance.triageId || event.provenance.alertId || event.provenance.sessionId) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "0.72rem", color: "var(--accent-primary)", fontWeight: 600 }}>
                        <LinkIcon size={12} />
                        Provenance:
                      </span>
                      {event.provenance.attemptId && (
                        <span style={{ fontSize: "0.7rem", padding: "1px 6px", borderRadius: "4px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", color: "var(--accent-primary)" }}>
                          Attempt #{event.provenance.attemptId.slice(-6)}
                        </span>
                      )}
                      {event.provenance.triageId && (
                        <span style={{ fontSize: "0.7rem", padding: "1px 6px", borderRadius: "4px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", color: "#8b5cf6" }}>
                          Triage #{event.provenance.triageId.slice(-6)}
                        </span>
                      )}
                      {event.provenance.alertId && (
                        <span style={{ fontSize: "0.7rem", padding: "1px 6px", borderRadius: "4px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--danger)" }}>
                          Alert #{event.provenance.alertId.slice(-6)}
                        </span>
                      )}
                      {event.provenance.sessionId && (
                        <span style={{ fontSize: "0.7rem", padding: "1px 6px", borderRadius: "4px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#10b981" }}>
                          Session #{event.provenance.sessionId.slice(-6)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Expand / Details Toggle */}
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div style={{ marginTop: "8px" }}>
                      <button
                        onClick={() => toggleExpand(event.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--accent-primary)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          padding: 0,
                        }}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={12} /> Less details
                          </>
                        ) : (
                          <>
                            <ChevronDown size={12} /> View details
                          </>
                        )}
                      </button>

                      {/* Expandable Details Box */}
                      {isExpanded && (
                        <div
                          style={{
                            marginTop: "8px",
                            padding: "10px 12px",
                            background: "rgba(0,0,0,0.02)",
                            borderRadius: "6px",
                            border: "1px solid var(--border-color)",
                            fontSize: "0.8rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          {/* Screening Details: show verified score fields */}
                          {event.category === "screening" && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                              {event.metadata.phq9Score !== undefined && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)", display: "block" }}>PHQ-9 Total</span>
                                  <strong>{event.metadata.phq9Score} / 27</strong>
                                </div>
                              )}
                              {event.metadata.gad7Score !== undefined && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)", display: "block" }}>GAD-7 Total</span>
                                  <strong>{event.metadata.gad7Score} / 21</strong>
                                </div>
                              )}
                              {event.metadata.pq16Score !== undefined && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)", display: "block" }}>PQ-16 Total</span>
                                  <strong>{event.metadata.pq16Score} / 16</strong>
                                </div>
                              )}
                              {event.metadata.wsasTotal !== undefined && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)", display: "block" }}>WSAS Total</span>
                                  <strong>{event.metadata.wsasTotal} / 40</strong>
                                </div>
                              )}
                              {event.metadata.reqolTotal !== undefined && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)", display: "block" }}>ReQoL-10 Total</span>
                                  <strong>{event.metadata.reqolTotal} / 40</strong>
                                </div>
                              )}
                              {event.metadata.item9Flag !== undefined && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)", display: "block" }}>Item 9 Flag</span>
                                  <strong style={{ color: event.metadata.item9Flag ? "var(--danger)" : "var(--success)" }}>
                                    {event.metadata.item9Flag ? "YES (Flagged)" : "No"}
                                  </strong>
                                </div>
                              )}
                              {event.metadata.triageLevel && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)", display: "block" }}>Triage Level</span>
                                  <strong style={{ textTransform: "uppercase" }}>{event.metadata.triageLevel}</strong>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Triage Details */}
                          {event.category === "triage" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <div>
                                <span style={{ color: "var(--text-secondary)" }}>Assessed Level: </span>
                                <strong>{String(event.metadata.level || event.severity).toUpperCase()}</strong>
                              </div>
                              {event.metadata.suicideFlag && (
                                <div style={{ color: "var(--danger)", fontWeight: 600 }}>
                                  ⚠️ Suicidal Ideation Risk Flagged
                                </div>
                              )}
                              {event.metadata.psychosisFlag && (
                                <div style={{ color: "var(--danger)", fontWeight: 600 }}>
                                  ⚠️ Psychosis / Early Attenuated Symptoms Flagged
                                </div>
                              )}
                            </div>
                          )}

                          {/* Safety Alert Details */}
                          {event.category === "safety" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <div>
                                <span style={{ color: "var(--text-secondary)" }}>Alert Type: </span>
                                <strong>{String(event.metadata.type || event.eventType).toUpperCase()}</strong>
                              </div>
                              {event.metadata.alertStatus && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)" }}>Status: </span>
                                  <span>{event.metadata.alertStatus}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* CBT Session Details: Clinical metrics only, NO raw conversation arrays */}
                          {event.category === "intervention" && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
                              {event.metadata.thinkingStyle && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)", display: "block" }}>Thinking Style</span>
                                  <strong>{event.metadata.thinkingStyle}</strong>
                                </div>
                              )}
                              {event.metadata.emotionBefore !== undefined && event.metadata.emotionAfter !== undefined && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)", display: "block" }}>Emotion Shift</span>
                                  <strong>
                                    {event.metadata.emotionBefore} → {event.metadata.emotionAfter}
                                  </strong>
                                </div>
                              )}
                              {event.metadata.beliefScore !== undefined && (
                                <div>
                                  <span style={{ color: "var(--text-secondary)", display: "block" }}>Belief Score</span>
                                  <strong>{event.metadata.beliefScore}%</strong>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Safe metadata provenance fallback */}
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", borderTop: "1px dashed var(--border-color)", paddingTop: "4px", marginTop: "4px" }}>
                            Source Table: <code style={{ fontSize: "0.7rem" }}>{event.sourceTable}</code> · Event ID: <code style={{ fontSize: "0.7rem" }}>{event.id}</code>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
