import { useState, useMemo, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { usePaginatedQuery, useMutation, useQuery, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { 
  Calendar, Clock, User, X, FileText, CheckCircle, AlertTriangle, Trash2, 
  RotateCcw, Search, ChevronRight, MessageSquare, Brain, Smile, Activity, HelpCircle, CheckSquare, Plus 
} from "lucide-react";
import { createPortal } from "react-dom";
import { useDashboardAuth } from "../components/AuthContext";

type TabStatus = "pending" | "waiting" | "accepted" | "rejected" | "completed";

export default function Sessions() {
  const { isAdmin } = useDashboardAuth();
  // Queries & Mutations
  const { results: appointments, status: queryStatus, loadMore } = usePaginatedQuery(
    api.appointments.listAllTwoWayAppointmentsPaginated,
    {},
    { initialNumItems: 20 }
  );

  const convex = useConvex();
  const [patientSearch, setPatientSearch] = useState("");
  const patientOptions = useQuery(api.users.searchPatientSelector, {
    search: patientSearch.trim() || undefined,
    limit: 50,
  });

  const createAppointment = useMutation(api.appointments.createAppointmentRequest);
  const updateStatus = useMutation(api.appointments.updateAppointmentStatus);
  const requestReschedule = useMutation(api.appointments.requestReschedule);
  const deleteAppointment = useMutation(api.appointments.deleteAppointment);
  const createFollowUp = useMutation(api.followUps.create);
  const markFollowUpComplete = useMutation(api.followUps.markComplete);

  // CBT sessions paginated query
  const cbtPage1 = useQuery(api.dashboard.listAllCbtSessions, { paginate: true });
  const [extraCbtSessions, setExtraCbtSessions] = useState<any[]>([]);
  const [cbtCursorState, setCbtCursorState] = useState<string | null | undefined>(undefined);
  const [cbtLoadingMore, setCbtLoadingMore] = useState(false);

  const effectiveCbtCursor = cbtCursorState !== undefined ? cbtCursorState : cbtPage1?.nextCursor ?? null;
  const hasMoreCbt = Boolean(effectiveCbtCursor);

  const cbtSessions = useMemo(() => {
    if (!cbtPage1) return undefined;
    const base = cbtPage1.sessions || [];
    const map = new Map<string, any>();
    for (const s of base) {
      map.set(s._id, s);
    }
    for (const s of extraCbtSessions) {
      map.set(s._id, s);
    }
    return Array.from(map.values());
  }, [cbtPage1, extraCbtSessions]);

  const handleLoadMoreCbt = async () => {
    if (!effectiveCbtCursor || cbtLoadingMore) return;
    setCbtLoadingMore(true);
    try {
      const res = await convex.query(api.dashboard.listAllCbtSessions, {
        cursor: effectiveCbtCursor,
        paginate: true,
      });
      if (res && res.sessions) {
        setExtraCbtSessions((prev) => [...prev, ...res.sessions]);
        setCbtCursorState(res.nextCursor);
      }
    } catch (err) {
      console.error("Failed to load more CBT sessions", err);
    } finally {
      setCbtLoadingMore(false);
    }
  };

  // States
  const [mainTab, setMainTab] = useState<"appointments" | "cbt" | "followups">("appointments");
  const [followUpFilter, setFollowUpFilter] = useState<"all" | "pending" | "completed">("pending");
  const followUps = useQuery(api.followUps.listAllFollowUps, { statusFilter: followUpFilter });
  const [showCreateFollowUpModal, setShowCreateFollowUpModal] = useState(false);
  const [followUpPatientId, setFollowUpPatientId] = useState("");
  const [followUpType, setFollowUpType] = useState("counselor_checkin");
  const [followUpDueDate, setFollowUpDueDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [followUpApptId, setFollowUpApptId] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState("");
  const [followUpSuccess, setFollowUpSuccess] = useState("");
  const [selectedCbtSession, setSelectedCbtSession] = useState<any | null>(null);
  
  const [activeTab, setActiveTab] = useState<TabStatus>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [cbtSearchQuery, setCbtSearchQuery] = useState("");
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);

  const [searchParams] = useSearchParams();
  const [counsellorRequestId, setCounsellorRequestId] = useState<string | null>(null);

  useEffect(() => {
    const studentIdParam = searchParams.get("studentId");
    const reqIdParam = searchParams.get("counsellorRequestId");
    if (studentIdParam) {
      setSelectedPatientId(studentIdParam);
      if (reqIdParam) {
        setCounsellorRequestId(reqIdParam);
        setTitle("Counselor Support Session");
        setReason("Follow-up session for counselor support request");
      }
      setShowCreateModal(true);
    }
  }, [searchParams]);

  // Form states
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  
  const [rejectionReason, setRejectionReason] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Data processing for appointments
  const filteredAppointments = useMemo(() => {
    if (!appointments) return [];
    return appointments.filter(appt => {
      const matchesTab = appt.status === activeTab;
      const matchesSearch = 
        appt.patientName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        appt.title?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [appointments, activeTab, searchQuery]);

  // Data processing for CBT sessions
  const filteredCbtSessions = useMemo(() => {
    if (!cbtSessions) return [];
    return cbtSessions.filter((s: any) => {
      return (
        s.patientName?.toLowerCase().includes(cbtSearchQuery.toLowerCase()) ||
        s.automaticThought?.toLowerCase().includes(cbtSearchQuery.toLowerCase()) ||
        (s.cbtDistortion && s.cbtDistortion.toLowerCase().includes(cbtSearchQuery.toLowerCase()))
      );
    });
  }, [cbtSessions, cbtSearchQuery]);

  // Utility to convert 24h to 12h
  const formatTime12Hour = (time24: string) => {
    if (!time24) return "";
    const [h, m] = time24.split(":");
    let hours = parseInt(h, 10);
    const suffix = hours >= 12 ? "PM" : "AM";
    if (hours === 0) hours = 12;
    if (hours > 12) hours -= 12;
    return `${hours.toString().padStart(2, '0')}:${m} ${suffix}`;
  };

  // Modal Handlers
  const openCreateModal = () => {
    setSelectedPatientId(""); setTitle(""); setDate(""); setTime(""); setReason(""); setCounsellorRequestId(null);
    setError(""); setSuccessMsg("");
    setShowCreateModal(true);
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !title || !date || !time || !reason) {
      setError("Please complete all required fields.");
      return;
    }

    const patient = patientOptions?.find((p: any) => p._id === selectedPatientId);
    if (!patient) return;

    setError(""); setSuccessMsg(""); setLoading(true);

    try {
      await createAppointment({
        userId: selectedPatientId as Id<"users">,
        title,
        createdBy: "admin",
        patientName: patient.full_name,
        date,
        time: formatTime12Hour(time),
        reason,
        counsellorRequestId: counsellorRequestId ? (counsellorRequestId as any) : undefined,
      });
      setSuccessMsg("Appointment request sent successfully!");
      setTimeout(() => setShowCreateModal(false), 1500);
    } catch (err: any) {
      setError(err.message || "Failed to send request.");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (appointmentId: Id<"appointments">) => {
    try {
      await updateStatus({ appointmentId, status: "accepted" });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason) {
      setError("Rejection reason is mandatory.");
      return;
    }
    setLoading(true);
    try {
      await updateStatus({
        appointmentId: selectedAppointment._id,
        status: "rejected",
        rejectionReason
      });
      setShowRejectModal(false);
      setRejectionReason("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTime || !rescheduleDate) {
      setError("Both time and date are required.");
      return;
    }
    setLoading(true);
    try {
      await requestReschedule({
        appointmentId: selectedAppointment._id,
        newTime: formatTime12Hour(rescheduleTime),
        newDate: rescheduleDate
      });
      setShowRescheduleModal(false);
      setRescheduleTime("");
      setRescheduleDate("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (appointmentId: Id<"appointments">) => {
    if (!window.confirm("Are you sure you want to delete this appointment request? This action cannot be undone.")) return;
    try {
      await deleteAppointment({ appointmentId });
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to delete appointment.");
    }
  };

  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpPatientId || !followUpDueDate) {
      setFollowUpError("Please select a student and due date.");
      return;
    }
    setFollowUpLoading(true);
    setFollowUpError("");
    setFollowUpSuccess("");
    try {
      await createFollowUp({
        userId: followUpPatientId,
        type: followUpType,
        dueDate: new Date(followUpDueDate).getTime(),
        notes: followUpNotes || undefined,
        appointmentId: followUpApptId ? (followUpApptId as Id<"appointments">) : undefined,
      });
      setFollowUpSuccess("Follow-up successfully created.");
      setTimeout(() => {
        setShowCreateFollowUpModal(false);
        setFollowUpPatientId("");
        setFollowUpDueDate("");
        setFollowUpNotes("");
        setFollowUpApptId("");
        setFollowUpSuccess("");
      }, 1200);
    } catch (err: any) {
      setFollowUpError(err.message || "Failed to create follow-up.");
    } finally {
      setFollowUpLoading(false);
    }
  };

  const handleMarkFollowUpComplete = async (followUpId: Id<"followUps">) => {
    try {
      await markFollowUpComplete({ id: followUpId });
    } catch (err: any) {
      alert(err.message || "Failed to mark follow-up complete.");
    }
  };

  const tabs = [
    { id: "pending", label: "Pending" },
    { id: "waiting", label: "Waiting" },
    { id: "accepted", label: "Accepted" },
    { id: "rejected", label: "Rejected" },
    { id: "completed", label: "Completed" },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted': return <span className="badge badge-green">Accepted</span>;
      case 'pending': return <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#ca8a04', border: '1px solid rgba(234, 179, 8, 0.3)' }}>Pending</span>;
      case 'waiting': return <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#0284c7', border: '1px solid rgba(56, 189, 248, 0.3)' }}>Waiting</span>;
      case 'rejected': return <span className="badge badge-red">Rejected</span>;
      case 'completed': return <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#9333ea', border: '1px solid rgba(168, 85, 247, 0.3)' }}>Completed</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  const renderCloseButton = (onClose: () => void) => (
    <button type="button" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
      ✕
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} className="animate-fade-in">
      
      {/* Top-Level Tab Switcher */}
      <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
        <button
          onClick={() => setMainTab("appointments")}
          style={{
            padding: "10px 20px",
            borderRadius: "10px",
            border: "none",
            background: mainTab === "appointments" ? "var(--accent-primary)" : "rgba(255, 255, 255, 0.08)",
            color: mainTab === "appointments" ? "white" : "var(--text-secondary)",
            fontWeight: 650,
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          Appointment Requests
        </button>
        <button
          onClick={() => setMainTab("cbt")}
          style={{
            padding: "10px 20px",
            borderRadius: "10px",
            border: "none",
            background: mainTab === "cbt" ? "var(--accent-primary)" : "rgba(255, 255, 255, 0.08)",
            color: mainTab === "cbt" ? "white" : "var(--text-secondary)",
            fontWeight: 650,
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          AI CBT Session Log
        </button>
        <button
          onClick={() => setMainTab("followups")}
          style={{
            padding: "10px 20px",
            borderRadius: "10px",
            border: "none",
            background: mainTab === "followups" ? "var(--accent-primary)" : "rgba(255, 255, 255, 0.08)",
            color: mainTab === "followups" ? "white" : "var(--text-secondary)",
            fontWeight: 650,
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          Care Follow-ups
        </button>
      </div>

      {/* BRANCH 1: APPOINTMENTS PAGE */}
      {mainTab === "appointments" && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: '2.4rem', marginBottom: '8px', color: 'var(--text-primary)' }}>Appointment Requests</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Manage appointment requests and scheduling.</p>
            </div>
            <button className="btn btn-primary" onClick={openCreateModal}>
              <Calendar size={18} /> New Request
            </button>
          </div>

          <div className="glass-panel hud-panel" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header & Tabs */}
            <div style={{ borderBottom: '1px solid var(--border-color)', background: '#ffffff' }}>
              <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '16px', background: 'var(--surface-base)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabStatus)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: activeTab === tab.id ? '#ffffff' : 'transparent',
                        color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: activeTab === tab.id ? 600 : 500,
                        boxShadow: activeTab === tab.id ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Search patient or title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      padding: '8px 12px 8px 36px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--surface-base)',
                      outline: 'none',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', minHeight: '400px' }}>
              {queryStatus === "LoadingFirstPage" ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading appointments...</div>
              ) : filteredAppointments.length === 0 ? (
                <div style={{ minHeight: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ padding: '20px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '50%', color: 'var(--accent-primary)' }}>
                    <Calendar size={36} />
                  </div>
                  <h2 style={{ fontSize: '1.3rem', color: 'var(--text-primary)' }}>No {activeTab} Appointments</h2>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Title & Reason</th>
                      <th>Date & Time</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAppointments.map((appt) => (
                      <tr key={appt._id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{appt.patientName}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{appt.title}</span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{appt.reason}</span>
                            {appt.counsellorRequestId && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                Linked to Counselor Request
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{appt.date}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} /> {appt.time}
                            </span>
                            {appt.status === 'waiting' && appt.rescheduleDate && (
                              <span style={{ fontSize: '0.8rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px', fontStyle: 'italic', marginTop: '2px' }}>
                                <RotateCcw size={10} /> New: {appt.rescheduleDate} at {appt.rescheduleTime}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{getStatusBadge(appt.status)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            {appt.status === 'pending' && appt.createdBy === 'user' && (
                              <>
                                <button className="btn btn-secondary" onClick={() => handleAccept(appt._id)} style={{ color: 'var(--success)' }}>
                                  Accept
                                </button>
                                <button className="btn btn-secondary" onClick={() => { setSelectedAppointment(appt); setRescheduleDate(appt.date ?? ""); setShowRescheduleModal(true); }}>
                                  Reschedule
                                </button>
                                <button className="btn btn-secondary" onClick={() => { setSelectedAppointment(appt); setShowRejectModal(true); }} style={{ color: 'var(--danger)' }}>
                                  Reject
                                </button>
                              </>
                            )}

                            {appt.status === 'waiting' && appt.rescheduledBy === 'user' && (
                              <>
                                <button className="btn btn-secondary" onClick={() => handleAccept(appt._id)} style={{ color: 'var(--success)' }}>
                                  Accept New Time
                                </button>
                                <button className="btn btn-secondary" onClick={() => { setSelectedAppointment(appt); setShowRejectModal(true); }} style={{ color: 'var(--danger)' }}>
                                  Reject
                                </button>
                              </>
                            )}

                            {appt.status === 'waiting' && appt.rescheduledBy === 'admin' && (
                               <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Awaiting User</span>
                            )}

                            {appt.status === 'pending' && appt.createdBy === 'admin' && (
                               <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Awaiting User</span>
                            )}
                            
                            {isAdmin && (
                              <button className="btn btn-secondary" onClick={() => handleDelete(appt._id)} style={{ color: 'var(--danger)', padding: '4px 8px' }} title="Delete Appointment">
                                 <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {queryStatus === "CanLoadMore" && (
                <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid var(--border-color)' }}>
                  <button className="btn btn-secondary" onClick={() => loadMore(20)}>
                    Load More <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* BRANCH 2: CBT SESSIONS LIST */}
      {mainTab === "cbt" && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: '2.4rem', marginBottom: '8px', color: 'var(--text-primary)' }}>AI CBT Session Log</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Review student dialog transcript logs, cognitive distortions, and safety flags.</p>
            </div>
          </div>

          <div className="glass-panel hud-panel" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Search filter bar */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff' }}>
              <span style={{ fontWeight: 650, color: 'var(--text-primary)' }}>CBT Session Log ({filteredCbtSessions.length} sessions)</span>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search patient, thought or trap..."
                  value={cbtSearchQuery}
                  onChange={(e) => setCbtSearchQuery(e.target.value)}
                  style={{
                    padding: '8px 12px 8px 36px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--surface-base)',
                    outline: 'none',
                    fontSize: '0.9rem',
                    width: '260px'
                  }}
                />
              </div>
            </div>

            {/* CBT Table */}
            <div style={{ overflowX: 'auto', minHeight: '400px' }}>
              {!cbtSessions ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading CBT therapy logs...</div>
              ) : filteredCbtSessions.length === 0 ? (
                <div style={{ minHeight: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ padding: '20px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '50%', color: 'var(--accent-primary)' }}>
                    <Brain size={36} />
                  </div>
                  <h2 style={{ fontSize: '1.3rem', color: 'var(--text-primary)' }}>No CBT Sessions Found</h2>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Automatic Thought</th>
                      <th>Trap Style</th>
                      <th>CBT Distortion</th>
                      <th>Tension Delta</th>
                      <th>Reframe Belief</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Dialogue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCbtSessions.map((session: any) => (
                      <tr key={session._id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{session.patientName}</td>
                        <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontStyle: 'italic' }}>"{session.automaticThought || "N/A"}"</span>
                        </td>
                        <td>{session.thinkingStyle || "N/A"}</td>
                        <td>{session.cbtDistortion ? <span className="badge badge-purple">{session.cbtDistortion}</span> : "N/A"}</td>
                        <td>
                          {session.emotionBefore !== undefined && session.emotionAfter !== undefined ? (
                            <span style={{ fontWeight: 600, color: session.emotionBefore > session.emotionAfter ? "var(--success)" : "var(--text-secondary)" }}>
                              {session.emotionBefore} → {session.emotionAfter} (-{session.emotionBefore - session.emotionAfter})
                            </span>
                          ) : "N/A"}
                        </td>
                        <td>{session.beliefScore !== undefined ? `${session.beliefScore}%` : "N/A"}</td>
                        <td>
                          <span className={`badge ${session.sessionStatus === 'completed' ? 'badge-green' : session.sessionStatus === 'safety_mode' ? 'badge-red' : 'badge-orange'}`}>
                            {session.sessionStatus}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 10px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => setSelectedCbtSession(session)}
                          >
                            <MessageSquare size={12} /> View transcript
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {hasMoreCbt && (
                <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "center", background: "#f8fafc" }}>
                  <button
                    onClick={handleLoadMoreCbt}
                    disabled={cbtLoadingMore}
                    className="btn btn-secondary"
                    style={{ padding: "8px 24px", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "8px" }}
                  >
                    {cbtLoadingMore ? "Loading more sessions..." : "Load More Sessions"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* BRANCH 3: CARE FOLLOW-UPS */}
      {mainTab === "followups" && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: '2.4rem', marginBottom: '8px', color: 'var(--text-primary)' }}>Care Follow-ups</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Track and manage scheduled counselor and clinical follow-ups.</p>
            </div>
            <button className="btn btn-primary" onClick={() => {
              setFollowUpError("");
              setFollowUpSuccess("");
              setShowCreateFollowUpModal(true);
            }}>
              <Plus size={18} /> New Follow-up
            </button>
          </div>

          <div className="glass-panel hud-panel" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header & Tabs */}
            <div style={{ borderBottom: '1px solid var(--border-color)', background: '#ffffff' }}>
              <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '16px', background: 'var(--surface-base)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  {(["pending", "completed", "all"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setFollowUpFilter(tab)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: followUpFilter === tab ? '#ffffff' : 'transparent',
                        color: followUpFilter === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: followUpFilter === tab ? 600 : 500,
                        cursor: 'pointer',
                        boxShadow: followUpFilter === tab ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                        textTransform: 'capitalize'
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Follow-up Table */}
            <div style={{ overflowX: 'auto' }}>
              {followUps === undefined ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading follow-ups...</div>
              ) : followUps.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No {followUpFilter === "all" ? "" : followUpFilter} follow-ups found.
                </div>
              ) : (
                <table className="hud-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Type</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Originating Appointment</th>
                      <th>Counselor Notes</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followUps.map((fu: any) => (
                      <tr key={fu._id}>
                        <td>
                          <Link to={`/patient/${fu.userId}`} style={{ fontWeight: 600, color: 'var(--accent-primary)', textDecoration: 'none' }}>
                            {fu.studentName || fu.studentPhone || fu.userId}
                          </Link>
                        </td>
                        <td>
                          <span style={{ textTransform: 'capitalize' }}>
                            {fu.type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                            <Calendar size={14} color="var(--text-secondary)" />
                            {new Date(fu.dueDate).toLocaleDateString()}
                          </div>
                        </td>
                        <td>
                          {fu.status === 'completed' || fu.completed ? (
                            <span className="badge badge-green">Completed</span>
                          ) : (
                            <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#ca8a04', border: '1px solid rgba(234, 179, 8, 0.3)' }}>Pending</span>
                          )}
                        </td>
                        <td>
                          {fu.appointmentTitle ? (
                            <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#0284c7', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                              {fu.appointmentTitle}
                            </span>
                          ) : fu.appointmentId ? (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Linked</span>
                          ) : (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>—</span>
                          )}
                        </td>
                        <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.9rem', color: fu.notes ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {fu.notes || "—"}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {fu.status !== 'completed' && !fu.completed ? (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              onClick={() => handleMarkFollowUpComplete(fu._id)}
                            >
                              <CheckSquare size={14} /> Mark Complete
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              Completed {fu.completedAt ? new Date(fu.completedAt).toLocaleDateString() : ""}
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
        </>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && createPortal(
        <div className="modal-overlay" style={overlayStyle}>
          <div className="glass-panel hud-panel" style={modalStyle}>
            {renderCloseButton(() => setShowCreateModal(false))}
            <h2>Create Appointment Request</h2>
            <form onSubmit={handleCreateAppointment} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Search patient by name / ID / phone..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="hud-input"
                  style={{ fontSize: "0.85rem", padding: "8px 12px" }}
                />
                <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)} className="hud-input">
                  <option value="">Select Student ({patientOptions?.length ?? 0} available)...</option>
                  {patientOptions?.map((p: any) => (
                    <option key={p._id} value={p._id}>
                      {p.full_name} ({p.patientId ? `#${p.patientId}` : p.mobile_number || "Student"})
                    </option>
                  ))}
                </select>
              </div>
              <input type="text" placeholder="Title (e.g. Weekly Check-in)" value={title} onChange={(e) => setTitle(e.target.value)} className="hud-input" />
              <div style={{ display: 'flex', gap: '16px' }}>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="hud-input" style={{ flex: 1 }} />
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="hud-input" style={{ flex: 1 }} />
              </div>
              <textarea placeholder="Reason / Description" value={reason} onChange={(e) => setReason(e.target.value)} className="hud-input" rows={3}></textarea>
              
              {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
              {successMsg && <div style={{ color: 'var(--success)' }}>{successMsg}</div>}
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>Send Request</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* REJECT MODAL */}
      {showRejectModal && createPortal(
        <div className="modal-overlay" style={overlayStyle}>
          <div className="glass-panel hud-panel" style={modalStyle}>
            {renderCloseButton(() => setShowRejectModal(false))}
            <h2 style={{ color: 'var(--danger)' }}>Reject Appointment</h2>
            <form onSubmit={handleRejectSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <textarea placeholder="Reason for rejection (mandatory)" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="hud-input" rows={3}></textarea>
              {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="submit" className="btn btn-danger" disabled={loading}>Confirm Reject</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* RESCHEDULE MODAL */}
      {showRescheduleModal && createPortal(
        <div className="modal-overlay" style={overlayStyle}>
          <div className="glass-panel hud-panel" style={modalStyle}>
            {renderCloseButton(() => setShowRescheduleModal(false))}
            <h2>Reschedule Appointment</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Must be on the same day ({selectedAppointment?.date})</p>
            <form onSubmit={handleRescheduleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} className="hud-input" />
              {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>Request Reschedule</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* CBT SESSION DETAIL TRANSCRIPT MODAL */}
      {selectedCbtSession && createPortal(
        <div className="modal-overlay" style={overlayStyle} onClick={() => setSelectedCbtSession(null)}>
          <div className="glass-panel hud-panel animate-fade-in" style={{ ...modalStyle, maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: "1.4rem", margin: "0 0 4px 0", color: "var(--text-primary)" }}>CBT Session Dialog Transcript</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
                  Student: <strong style={{ color: 'var(--text-primary)' }}>{selectedCbtSession.patientName}</strong> • Date: {new Date(selectedCbtSession.timestamp).toLocaleString()}
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedCbtSession(null)} 
                className="btn btn-secondary"
                style={{ padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                ✕ Close
              </button>
            </div>

            {/* Session Clinical Metadata Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", padding: "16px", background: "rgba(0,0,0,0.02)", border: "1px solid var(--border-color)", borderRadius: "12px", marginBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Situation</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>{selectedCbtSession.situation || "Unknown"}</span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>CBT Distortion (Internal)</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 600 }}>{selectedCbtSession.cbtDistortion || "N/A"}</span>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Automatic Thought</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontStyle: "italic" }}>"{selectedCbtSession.automaticThought || "N/A"}"</span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Thinking Style</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>{selectedCbtSession.thinkingStyle || "N/A"}</span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Balanced Reframe</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 550 }}>"{selectedCbtSession.balancedThought || "N/A"}"</span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Belief Rating</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 600 }}>{selectedCbtSession.beliefScore !== undefined ? `${selectedCbtSession.beliefScore}%` : "N/A"}</span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>Behavioral Goal</span>
                <span style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>
                  {selectedCbtSession.recommendedGoal ? `🎯 ${selectedCbtSession.recommendedGoal.title}` : "None"}
                  {selectedCbtSession.goalCompletion ? " (Accepted)" : " (Skipped)"}
                </span>
              </div>
            </div>

            {/* Conversation list */}
            <h3 style={{ fontSize: "1.1rem", margin: "14px 0 10px 0", color: "var(--text-primary)" }}>Counselor Dialogue Log</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", border: "1px solid var(--border-color)", borderRadius: "12px", background: "#f8fafc" }}>
              {selectedCbtSession.conversation?.map((msg: any, idx: number) => {
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
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
                  }}>
                    <strong style={{ display: "block", fontSize: "0.75rem", color: isUser ? "rgba(255,255,255,0.7)" : "#64748b", marginBottom: "2px" }}>
                      {isUser ? "Student" : "Compassionate AI Counselor"}
                    </strong>
                    <span style={{ fontSize: "0.95rem", lineHeight: 1.45 }}>{msg.content}</span>
                  </div>
                );
              })}
            </div>

            
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
              <button className="btn btn-secondary" onClick={() => setSelectedCbtSession(null)} style={{ padding: "8px 20px", fontWeight: 650 }}>
                Close Transcript
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CREATE FOLLOW-UP MODAL */}
      {showCreateFollowUpModal && createPortal(
        <div className="modal-overlay" style={overlayStyle}>
          <div className="glass-panel hud-panel" style={modalStyle}>
            {renderCloseButton(() => setShowCreateFollowUpModal(false))}
            <h2>Create Care Follow-up</h2>
            <form onSubmit={handleCreateFollowUp} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Search patient by name / ID / phone..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="hud-input"
                  style={{ fontSize: "0.85rem", padding: "8px 12px" }}
                />
                <select 
                  value={followUpPatientId} 
                  onChange={(e) => setFollowUpPatientId(e.target.value)} 
                  className="hud-input"
                  required
                >
                  <option value="">Select Student ({patientOptions?.length ?? 0} available)...</option>
                  {patientOptions?.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.phone ? `(${p.phone})` : ''} - ID: {p.id.slice(-6)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px", color: "var(--text-secondary)" }}>
                    Follow-up Type
                  </label>
                  <select 
                    value={followUpType} 
                    onChange={(e) => setFollowUpType(e.target.value)} 
                    className="hud-input"
                  >
                    <option value="counselor_checkin">Counselor Check-in</option>
                    <option value="clinical_monitoring">Clinical Monitoring</option>
                    <option value="routine_checkin">Routine Check-in</option>
                    <option value="triage_followup">Triage Follow-up</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px", color: "var(--text-secondary)" }}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={followUpDueDate}
                    onChange={(e) => setFollowUpDueDate(e.target.value)}
                    className="hud-input"
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px", color: "var(--text-secondary)" }}>
                  Link to Originating Appointment (Optional)
                </label>
                <select
                  value={followUpApptId}
                  onChange={(e) => setFollowUpApptId(e.target.value)}
                  className="hud-input"
                >
                  <option value="">None (Standalone Follow-up)</option>
                  {appointments
                    ?.filter(a => !followUpPatientId || a.userId === followUpPatientId)
                    .map(a => (
                      <option key={a._id} value={a._id}>
                        {a.title} ({a.date} at {a.time}) - {a.patientName}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "6px", color: "var(--text-secondary)" }}>
                  Internal Counselor Notes (Staff only)
                </label>
                <textarea
                  placeholder="Notes, observations, or follow-up goals..."
                  value={followUpNotes}
                  onChange={(e) => setFollowUpNotes(e.target.value)}
                  className="hud-input"
                  rows={3}
                />
              </div>

              {followUpError && <div style={{ color: "var(--error)", fontSize: "0.9rem" }}>{followUpError}</div>}
              {followUpSuccess && <div style={{ color: "var(--success)", fontSize: "0.9rem" }}>{followUpSuccess}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowCreateFollowUpModal(false)}
                  disabled={followUpLoading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={followUpLoading}
                >
                  {followUpLoading ? "Creating..." : "Create Follow-up"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(12px)",
  zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px"
};

const modalStyle: React.CSSProperties = {
  position: "relative", width: "100%", padding: "32px", borderRadius: "20px",
  background: "var(--card-bg)", display: "flex", flexDirection: "column", gap: "16px"
};
