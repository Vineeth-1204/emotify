import { useState, useMemo } from "react";
import { MessageSquare, Phone, Calendar, Clock, User, Sparkles, Search, CheckCircle2, PhoneCall, Check, XCircle } from "lucide-react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigate, Link } from "react-router-dom";

export default function CounsellorRequests() {
  const navigate = useNavigate();
  const convex = useConvex();
  const reqPage1 = useQuery(api.dashboard.getCounsellorRequests, { paginate: true });
  const [extraRequests, setExtraRequests] = useState<any[]>([]);
  const [reqCursorState, setReqCursorState] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const effectiveReqCursor = reqCursorState !== undefined ? reqCursorState : reqPage1?.nextCursor ?? null;
  const hasMore = Boolean(effectiveReqCursor);

  const requests = useMemo(() => {
    if (!reqPage1) return undefined;
    const base = reqPage1.requests || [];
    const map = new Map<string, any>();
    for (const r of base) {
      map.set(r._id, r);
    }
    for (const r of extraRequests) {
      map.set(r._id, r);
    }
    return Array.from(map.values());
  }, [reqPage1, extraRequests]);

  const handleLoadMore = async () => {
    if (!effectiveReqCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await convex.query(api.dashboard.getCounsellorRequests, {
        cursor: effectiveReqCursor,
        paginate: true,
      });
      if (res && res.requests) {
        setExtraRequests((prev) => [...prev, ...res.requests]);
        setReqCursorState(res.nextCursor);
      }
    } catch (err) {
      console.error("Failed to load more requests", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const updateStatus = useMutation(api.counsellorRequests.updateStatus);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending" | "scheduled" | "completed" | "all">("pending");

  const handleStatusChange = async (requestId: any, newStatus: string) => {
    try {
      await updateStatus({ requestId, status: newStatus });
    } catch (e) {
      console.error(e);
      alert("Failed to update status.");
    }
  };

  const allReqs = requests || [];
  const pendingCount = allReqs.filter((r: any) => !r.status || r.status === "pending").length;
  const scheduledCount = allReqs.filter((r: any) => r.status === "scheduled").length;
  const completedCount = allReqs.filter((r: any) => r.status === "completed").length;

  const filteredRequests = allReqs.filter((req: any) => {
    const status = req.status || "pending";

    if (statusFilter === "pending" && status !== "pending") return false;
    if (statusFilter === "scheduled" && status !== "scheduled") return false;
    if (statusFilter === "completed" && status !== "completed") return false;
    if (statusFilter === "all" && status === "completed") return false; // "all" displays active requests (pending & scheduled)

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const nameMatch = (req.patientName || "").toLowerCase().includes(term);
      const phoneMatch = (req.patientMobile || "").toLowerCase().includes(term);
      const thoughtMatch = (req.thought_original || "").toLowerCase().includes(term);
      const situationMatch = (req.situation_text || "").toLowerCase().includes(term);
      return nameMatch || phoneMatch || thoughtMatch || situationMatch;
    }
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }} className="animate-fade-in">
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "2.2rem", fontWeight: 800, marginBottom: "4px", color: "var(--text-primary)" }}>
            Counsellor Call Requests
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "1rem", margin: 0 }}>
            Direct intervention requests logged by patients during CBT and reframe exercises.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        <div 
          className="glass-panel hud-panel animate-fade-in delay-1"
          onClick={() => setStatusFilter("all")}
          style={{ cursor: "pointer", borderTop: "3px solid var(--accent-primary)", background: statusFilter === "all" ? "rgba(99, 102, 241, 0.08)" : "transparent" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Total Requests</span>
            <Sparkles size={18} color="var(--accent-primary)" />
          </div>
          <p className="hud-num" style={{ fontSize: "2.6rem", fontWeight: 800, margin: 0 }}>{allReqs.length}</p>
        </div>

        <div 
          className="glass-panel hud-panel animate-fade-in delay-2"
          onClick={() => setStatusFilter("pending")}
          style={{ cursor: "pointer", borderTop: "3px solid var(--warning)", background: statusFilter === "pending" ? "rgba(249, 115, 22, 0.08)" : "transparent" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--warning)", textTransform: "uppercase" }}>Pending</span>
            <Clock size={18} color="var(--warning)" />
          </div>
          <p className="hud-num" style={{ fontSize: "2.6rem", fontWeight: 800, color: "var(--warning)", margin: 0 }}>{pendingCount}</p>
        </div>

        <div 
          className="glass-panel hud-panel animate-fade-in delay-3"
          onClick={() => setStatusFilter("scheduled")}
          style={{ cursor: "pointer", borderTop: "3px solid var(--accent-primary)", background: statusFilter === "scheduled" ? "rgba(37, 99, 235, 0.08)" : "transparent" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-primary)", textTransform: "uppercase" }}>Scheduled</span>
            <Calendar size={18} color="var(--accent-primary)" />
          </div>
          <p className="hud-num" style={{ fontSize: "2.6rem", fontWeight: 800, color: "var(--accent-primary)", margin: 0 }}>{scheduledCount}</p>
        </div>

        <div 
          className="glass-panel hud-panel animate-fade-in delay-4"
          onClick={() => setStatusFilter("completed")}
          style={{ cursor: "pointer", borderTop: "3px solid var(--success)", background: statusFilter === "completed" ? "rgba(34, 197, 94, 0.08)" : "transparent" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--success)", textTransform: "uppercase" }}>Completed</span>
            <CheckCircle2 size={18} color="var(--success)" />
          </div>
          <p className="hud-num" style={{ fontSize: "2.6rem", fontWeight: 800, color: "var(--success)", margin: 0 }}>{completedCount}</p>
        </div>
      </div>

      {/* Main Queue Table Panel */}
      <div className="glass-panel hud-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", background: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <h2 style={{ fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "10px", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>
            <MessageSquare size={20} color="var(--accent-primary)" />
            Intervention Queue
          </h2>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {/* Search Input */}
            <div style={{ position: "relative", width: "220px" }}>
              <Search size={15} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
              <input
                type="text"
                placeholder="Search requests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 12px 7px 34px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  fontSize: "0.85rem",
                  outline: "none"
                }}
              />
            </div>

            {/* Status Filter Tabs */}
            <div style={{ display: "flex", background: "rgba(0,0,0,0.04)", padding: "3px", borderRadius: "8px", gap: "2px" }}>
              {(["pending", "scheduled", "completed", "all"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "6px",
                    fontSize: "0.78rem",
                    fontWeight: statusFilter === tab ? 700 : 500,
                    background: statusFilter === tab ? "#ffffff" : "transparent",
                    color: statusFilter === tab ? "var(--text-primary)" : "var(--text-secondary)",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: statusFilter === tab ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    textTransform: "capitalize"
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {requests === undefined ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--text-secondary)" }}>
              Loading counsellor call requests...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
              <CheckCircle2 size={40} color="var(--success)" />
              <h4 style={{ margin: 0, fontSize: "1.1rem", color: "var(--text-primary)" }}>No Requests Found</h4>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                No counsellor call requests match your filter criteria.
              </p>
            </div>
          ) : (
            filteredRequests.map((req: any) => {
              const reqDate = new Date(req.timestamp);
              const statusStr = (req.status || "pending").toLowerCase();
              const isPending = statusStr === "pending";
              const isScheduled = statusStr === "scheduled";
              const isCompleted = statusStr === "completed";

              const statusBg = isCompleted ? "rgba(34, 197, 94, 0.12)" : isScheduled ? "rgba(37, 99, 235, 0.12)" : "rgba(249, 115, 22, 0.12)";
              const statusColor = isCompleted ? "#15803d" : isScheduled ? "#1d4ed8" : "#c2410c";
              const statusBorder = isCompleted ? "rgba(34, 197, 94, 0.3)" : isScheduled ? "rgba(37, 99, 235, 0.3)" : "rgba(249, 115, 22, 0.3)";

              return (
                <div
                  key={req._id}
                  style={{
                    padding: "20px 24px",
                    borderBottom: "1px solid var(--border-color)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                    background: isCompleted ? "#fafafa" : "#ffffff",
                    opacity: isCompleted ? 0.75 : 1,
                    transition: "all 0.2s ease"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(99, 102, 241, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent-primary)", fontWeight: 700, fontSize: "1.1rem", flexShrink: 0 }}>
                        {req.patientName?.charAt(0) || "P"}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <Link 
                            to={`/patients/${req.patientId}`}
                            style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", textDecoration: "none" }}
                          >
                            {req.patientName}
                          </Link>

                          <span style={{ 
                            fontSize: "0.68rem", 
                            fontWeight: 700, 
                            letterSpacing: "0.05em", 
                            padding: "2px 8px", 
                            borderRadius: "4px",
                            textTransform: "uppercase",
                            background: statusBg,
                            color: statusColor,
                            border: `1px solid ${statusBorder}`
                          }}>
                            {statusStr}
                          </span>
                        </div>

                        <p style={{ margin: "2px 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          {req.patientMobile && req.patientMobile !== "N/A" && (
                            <a href={`tel:${req.patientMobile}`} style={{ color: "var(--text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <Phone size={13} /> {req.patientMobile}
                            </a>
                          )}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "5px", marginRight: "8px" }}>
                        <Clock size={13} /> {reqDate.toLocaleDateString()} {reqDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>

                      {req.patientMobile && req.patientMobile !== "N/A" && (
                        <a
                          href={`tel:${req.patientMobile}`}
                          className="btn btn-secondary"
                          style={{ padding: "6px 12px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px", textDecoration: "none" }}
                        >
                          <PhoneCall size={14} color="var(--success)" /> Call Now
                        </a>
                      )}

                      {!isScheduled && !isCompleted && (
                        <button
                          className="btn btn-primary"
                          onClick={async () => {
                            await handleStatusChange(req._id, "scheduled");
                            navigate(`/sessions`);
                          }}
                          style={{ padding: "6px 12px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px" }}
                        >
                          <Calendar size={14} /> Schedule Call
                        </button>
                      )}

                      {!isCompleted && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleStatusChange(req._id, "completed")}
                          style={{ padding: "6px 12px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px", color: "var(--success)" }}
                        >
                          <Check size={14} /> Mark Completed
                        </button>
                      )}

                      <button
                        className="btn btn-secondary"
                        onClick={() => navigate(`/patients/${req.patientId}`)}
                        style={{ padding: "6px 12px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <User size={14} /> Patient Profile
                      </button>
                    </div>
                  </div>

                  {/* Situation & Thought Context */}
                  {(req.situation_text || req.thought_original) && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", background: "#f8fafc", padding: "12px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                      <div>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Situation Context</span>
                        <p style={{ margin: "2px 0 0 0", fontSize: "0.88rem", color: "#334155", fontWeight: 500 }}>
                          {req.situation_text || "None provided"}
                        </p>
                      </div>
                      <div>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Logged Thought</span>
                        <p style={{ margin: "2px 0 0 0", fontSize: "0.88rem", color: "#334155", fontWeight: 500 }}>
                          {req.thought_original || "None provided"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {hasMore && (
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "center", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="btn btn-secondary"
                style={{ padding: "8px 24px", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                {loadingMore ? "Loading more requests..." : "Load More Requests"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
