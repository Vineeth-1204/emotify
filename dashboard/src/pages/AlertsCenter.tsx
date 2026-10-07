import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AlertTriangle, ShieldAlert, Clock, Activity, Target, Search, Phone, ExternalLink, CheckCircle2, AlertOctagon, Filter, Unlock, ArrowRight, RefreshCw } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function AlertsCenter() {
  const alerts = useQuery(api.dashboard.getAlerts);
  const unblockPatientMutation = useMutation(api.triage.unblockPatient);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "escalated" | "resolved">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [unblockTarget, setUnblockTarget] = useState<{ id: string; name: string } | null>(null);
  const [isSubmittingUnblock, setIsSubmittingUnblock] = useState(false);

  // Acknowledged alerts are still open (being handled) until resolved.
  const isAlertActive = (status: string) => status === 'active' || status === 'pending' || status === 'acknowledged';
  const isAlertEscalated = (status: string) => status === 'escalated';

  const activeAlerts = alerts?.filter((a: any) => isAlertActive(a.status) || isAlertEscalated(a.status)) || [];
  const suicideAlerts = activeAlerts.filter((a: any) => a.type === 'suicideRisk' || a.type === 'suicide');
  const psychosisAlerts = activeAlerts.filter((a: any) => a.type === 'psychosisRisk' || a.type === 'psychosis');
  const deteriorationAlerts = activeAlerts.filter((a: any) => a.type !== 'suicideRisk' && a.type !== 'suicide' && a.type !== 'psychosisRisk' && a.type !== 'psychosis');

  const filteredAlerts = (alerts || []).filter((a: any) => {
    // Status filter
    if (statusFilter === "active" && !isAlertActive(a.status)) return false;
    if (statusFilter === "escalated" && !isAlertEscalated(a.status)) return false;
    if (statusFilter === "resolved" && a.status !== "resolved") return false;

    // Type filter
    if (typeFilter === "suicide" && !(a.type === 'suicideRisk' || a.type === 'suicide')) return false;
    if (typeFilter === "psychosis" && !(a.type === 'psychosisRisk' || a.type === 'psychosis')) return false;
    if (typeFilter === "deterioration" && (a.type === 'suicideRisk' || a.type === 'suicide' || a.type === 'psychosisRisk' || a.type === 'psychosis')) return false;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const nameMatch = (a.patientName || "").toLowerCase().includes(term);
      const phoneMatch = (a.patientMobile || "").toLowerCase().includes(term);
      const typeMatch = (a.type || "").toLowerCase().includes(term);
      return nameMatch || phoneMatch || typeMatch;
    }
    return true;
  });

  const handleUnblockAction = async (action: "switch_moderate" | "switch_low" | "force_retest") => {
    if (!unblockTarget) return;
    try {
      setIsSubmittingUnblock(true);
      await unblockPatientMutation({ userId: unblockTarget.id, action });
      setUnblockTarget(null);
    } catch (e: any) {
      alert("Error unblocking patient: " + (e.message || e.toString()));
    } finally {
      setIsSubmittingUnblock(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }} className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '4px', color: 'var(--text-primary)' }}>
            Alerts
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: 0 }}>
            Review student safety alerts and follow-up status.
          </p>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid-3">
        <div 
          className="glass-panel hud-panel animate-fade-in delay-1" 
          onClick={() => setTypeFilter(typeFilter === "suicide" ? "all" : "suicide")}
          style={{ 
            borderTop: '3px solid var(--danger)', 
            background: typeFilter === "suicide" ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.02)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
              <ShieldAlert size={18} />
              Suicide Risk
            </h3>
            <span className="hud-tag" style={{ color: 'var(--danger)', background: 'rgba(244, 63, 94, 0.1)', borderColor: 'rgba(244, 63, 94, 0.3)', fontSize: '0.65rem', padding: '2px 8px', fontWeight: 700 }}>
              HIGH RISK
            </span>
          </div>
          <p className="hud-num" style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--danger)', lineHeight: 1, margin: 0 }}>{suicideAlerts.length}</p>
        </div>

        <div 
          className="glass-panel hud-panel animate-fade-in delay-2" 
          onClick={() => setTypeFilter(typeFilter === "psychosis" ? "all" : "psychosis")}
          style={{ 
            borderTop: '3px solid var(--warning)', 
            background: typeFilter === "psychosis" ? 'rgba(249, 115, 22, 0.08)' : 'rgba(249, 115, 22, 0.02)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ color: '#c2410c', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
              <AlertTriangle size={18} />
              Psychosis Risk
            </h3>
            <span className="hud-tag" style={{ color: 'var(--warning)', background: 'rgba(249, 115, 22, 0.1)', borderColor: 'rgba(249, 115, 22, 0.3)', fontSize: '0.65rem', padding: '2px 8px', fontWeight: 700 }}>
              MEDIUM RISK
            </span>
          </div>
          <p className="hud-num" style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--warning)', lineHeight: 1, margin: 0 }}>{psychosisAlerts.length}</p>
        </div>

        <div 
          className="glass-panel hud-panel animate-fade-in delay-3" 
          onClick={() => setTypeFilter(typeFilter === "deterioration" ? "all" : "deterioration")}
          style={{ 
            borderTop: '3px solid var(--caution)', 
            background: typeFilter === "deterioration" ? 'rgba(234, 179, 8, 0.08)' : 'rgba(234, 179, 8, 0.02)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ color: '#a16207', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
              <Activity size={18} />
              Deterioration
            </h3>
            <span className="hud-tag" style={{ color: 'var(--caution)', background: 'rgba(234, 179, 8, 0.1)', borderColor: 'rgba(234, 179, 8, 0.3)', fontSize: '0.65rem', padding: '2px 8px', fontWeight: 700 }}>
              CARE WATCH
            </span>
          </div>
          <p className="hud-num" style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--caution)', lineHeight: 1, margin: 0 }}>{deteriorationAlerts.length}</p>
        </div>
      </div>

      {/* Alert Controls & Emergency Queue Container */}
      <div className="glass-panel hud-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header & Filter Controls */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', background: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, fontWeight: 700 }}>
            <Target size={20} color="var(--accent-primary)"/>
            Alert list
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Search patient..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 34px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>

            {/* Status Filter Tabs */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.04)', padding: '3px', borderRadius: '8px', gap: '2px' }}>
              {(["all", "active", "escalated", "resolved"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: statusFilter === tab ? 700 : 500,
                    background: statusFilter === tab ? '#ffffff' : 'transparent',
                    color: statusFilter === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: statusFilter === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    textTransform: 'capitalize'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active Filter Bar (if any) */}
        {typeFilter !== "all" && (
          <div style={{ padding: '8px 24px', background: 'rgba(37, 99, 235, 0.05)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem' }}>
            <Filter size={14} color="var(--accent-primary)" />
            <span>Filtering by type: <strong style={{ textTransform: 'capitalize' }}>{typeFilter}</strong></span>
            <button onClick={() => setTypeFilter("all")} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>Clear filter</button>
          </div>
        )}
        
        {/* Queue Items */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {alerts === undefined ? (
             <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
               Connecting to real-time alert stream...
             </div>
          ) : filteredAlerts.length === 0 ? (
             <div style={{ padding: '48px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
               <CheckCircle2 size={40} color="var(--success)" />
               <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>All Clear</h4>
               <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                 No active alerts match the selected criteria.
               </p>
             </div>
          ) : (
            filteredAlerts.map((alert: any) => {
              const isRed = alert.type === 'suicideRisk' || alert.type === 'suicide';
              const isOrange = alert.type === 'psychosisRisk' || alert.type === 'psychosis';
              const strokeColor = isRed ? 'var(--danger)' : isOrange ? 'var(--warning)' : 'var(--caution)';
              const colorVar = isRed ? '#b91c1c' : isOrange ? '#c2410c' : '#a16207';
              const bgLight = isRed ? 'rgba(239, 68, 68, 0.08)' : isOrange ? 'rgba(249, 115, 22, 0.08)' : 'rgba(234, 179, 8, 0.08)';
              
              const statusStr = (alert.status || "active").toLowerCase();
              const isEscalated = statusStr === "escalated";
              const isResolved = statusStr === "resolved";
              const isActive = !isResolved;

              const alertTitle = isRed 
                ? 'Suicide Risk Alert' 
                : isOrange 
                ? 'Psychosis Risk Alert' 
                : alert.type === 'counselor_request'
                ? 'Counselor Escalation'
                : `${alert.type.charAt(0).toUpperCase() + alert.type.slice(1).replace(/_/g, ' ')} Alert`;

              return (
                <div 
                  key={alert._id} 
                  style={{ 
                    padding: '20px 24px', 
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex', 
                    gap: '20px', 
                    alignItems: 'flex-start',
                    background: isEscalated ? 'rgba(239, 68, 68, 0.03)' : isResolved ? '#fafafa' : '#ffffff',
                    opacity: isResolved ? 0.65 : 1,
                    transition: 'all 0.2s ease-in-out'
                  }}
                  className="alert-queue-item"
                >
                  {/* Status Icon */}
                  <div style={{ padding: '14px', background: bgLight, borderRadius: '12px', color: strokeColor, border: `1px solid ${strokeColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                     {isRed ? <ShieldAlert size={24} /> : isOrange ? <AlertOctagon size={24} /> : <AlertTriangle size={24} />}
                  </div>

                  {/* Main Content */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h3 style={{ color: colorVar, fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                          {alertTitle}
                        </h3>

                        {/* Status Badge */}
                        <span style={{ 
                          fontSize: '0.68rem', 
                          fontWeight: 700, 
                          letterSpacing: '0.05em', 
                          padding: '2px 8px', 
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          background: isEscalated ? 'rgba(239, 68, 68, 0.15)' : isResolved ? 'rgba(34, 197, 94, 0.15)' : 'rgba(249, 115, 22, 0.15)',
                          color: isEscalated ? '#b91c1c' : isResolved ? '#15803d' : '#c2410c',
                          border: `1px solid ${isEscalated ? 'rgba(239, 68, 68, 0.3)' : isResolved ? 'rgba(34, 197, 94, 0.3)' : 'rgba(249, 115, 22, 0.3)'}`
                        }}>
                          {alert.status}
                        </span>
                      </div>

                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={13} />
                        {new Date(alert.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {/* Patient Core Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '14px', fontSize: '0.92rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        Student: 
                        <Link 
                          to={`/patients/${alert.patientId}`} 
                          style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          {alert.patientName}
                          <ExternalLink size={12} />
                        </Link>
                      </span>

                      {alert.patientMobile && alert.patientMobile !== "N/A" && (
                        <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem' }}>
                          <Phone size={13} />
                          {alert.patientMobile}
                        </span>
                      )}
                    </div>

                    {/* Action Hub */}
                    {isActive && (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button 
                          onClick={() => setUnblockTarget({ id: alert.patientId, name: alert.patientName || "Student" })} 
                          className="btn btn-danger" 
                          style={{ 
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.85rem',
                            padding: '6px 14px',
                            fontWeight: 600
                          }}
                        >
                          <Unlock size={14} /> Review triage actions
                        </button>

                        <Link
                          to={`/patients/${alert.patientId}`}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.85rem', padding: '6px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          Student Profile
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* UNBLOCK PATIENT ACTION MODAL */}
      {unblockTarget && createPortal(
        <div style={overlayStyle} onClick={() => !isSubmittingUnblock && setUnblockTarget(null)}>
          <div className="glass-panel animate-fade-in" style={{ ...modalStyle, maxWidth: "550px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ padding: "8px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>
                  <Unlock size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: "1.3rem", margin: 0, color: "var(--text-primary)" }}>Triage actions</h3>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Student: <strong>{unblockTarget.name}</strong></span>
                </div>
              </div>
              <button
                className="btn btn-secondary"
                disabled={isSubmittingUnblock}
                onClick={() => setUnblockTarget(null)}
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
                onClick={() => setUnblockTarget(null)}
                style={{ padding: "8px 18px", fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>
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

