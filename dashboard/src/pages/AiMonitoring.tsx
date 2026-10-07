import React, { useState, useEffect, useRef } from "react";
import {
  BrainCircuit,
  ShieldAlert,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Activity,
  MessageSquare,
  ArrowLeft,
  Search,
  User,
  Sparkles,
  ChevronRight,
  MessageCircle,
  Calendar
} from "lucide-react";
import { useQuery } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";

function formatTimestamp(ms: number) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateHeader(ms: number) {
  if (!ms) return "";
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function AiMonitoring() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeUserIdFromUrl = searchParams.get("userId");

  const [selectedUserId, setSelectedUserId] = useState<string | null>(activeUserIdFromUrl);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "telemetry">("users");

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Queries
  const aiChatsData = useQuery(api.dashboard.getUsersWithAiChats);
  const chatHistoryData = useQuery(
    api.dashboard.getPatientAiChatHistoryAdmin,
    selectedUserId ? { userId: selectedUserId } : "skip"
  );
  const telemetryLogs = useQuery(api.dashboard.getAiMonitoringLogs);

  // Sync state with URL parameter
  useEffect(() => {
    if (activeUserIdFromUrl) {
      setSelectedUserId(activeUserIdFromUrl);
    } else {
      setSelectedUserId(null);
    }
  }, [activeUserIdFromUrl]);

  // Scroll to bottom when conversation loads
  useEffect(() => {
    if (selectedUserId && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [selectedUserId, chatHistoryData]);

  const handleOpenConversation = (userId: string) => {
    setSelectedUserId(userId);
    setSearchParams({ userId });
  };

  const handleBackToList = () => {
    setSelectedUserId(null);
    setSearchParams({});
    setChatSearchQuery("");
  };

  const isLoadingUsers = aiChatsData === undefined;
  const usersList = aiChatsData?.users ?? [];
  const stats = aiChatsData?.stats ?? { totalUsers: 0, totalMessages: 0, activeToday: 0, highRiskFlags: 0 };

  const filteredUsers = usersList.filter(
    (u: any) =>
      u.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.patientIdDisplay.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.latestMessageSnippet.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filtered messages in active conversation
  const rawMessages = chatHistoryData?.messages ?? [];
  const patientInfo = chatHistoryData?.patient;
  const filteredChatMessages = chatSearchQuery.trim()
    ? rawMessages.filter((m: any) => m.content.toLowerCase().includes(chatSearchQuery.toLowerCase()))
    : rawMessages;

  // Render individual chat view if a user is selected
  if (selectedUserId) {
    const isLoadingChat = chatHistoryData === undefined;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "calc(100vh - 120px)" }} className="animate-fade-in">
        
        {/* Navigation Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <button
            onClick={handleBackToList}
            className="glass-panel"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              borderRadius: 12,
              border: "1px solid var(--border-color)",
              background: "var(--card-bg)",
              color: "var(--text-primary)",
              fontSize: "0.88rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--card-bg)"; }}
          >
            <ArrowLeft size={16} />
            Back to AI Users List
          </button>

          {/* Search inside conversation */}
          <div style={{ position: "relative", minWidth: 260 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
            <input
              type="text"
              placeholder="Search in conversation..."
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 14px 8px 36px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--card-bg)",
                fontSize: "0.85rem",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Conversation Header & Chat Box */}
        <div className="glass-panel" style={{ flex: 1, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
          
          {/* Header */}
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border-color)",
              background: "rgba(248, 250, 252, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  boxShadow: "0 2px 10px rgba(37,99,235,0.25)",
                }}
              >
                {patientInfo?.patientName ? patientInfo.patientName.charAt(0).toUpperCase() : <User size={20} />}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    {patientInfo?.patientName || "Patient AI Conversation"}
                  </h2>
                  <span
                    style={{
                      background: "rgba(37,99,235,0.1)",
                      color: "var(--accent-primary)",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: "0.72rem",
                      fontWeight: 700,
                    }}
                  >
                    ID: #{patientInfo?.patientIdDisplay || selectedUserId.slice(-6)}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  {patientInfo?.email} · {rawMessages.length} total messages with Emoty AI
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(16,185,129,0.1)",
                  color: "var(--success)",
                  border: "1px solid rgba(16,185,129,0.25)",
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                <Sparkles size={13} /> Emoty AI Companion
              </span>
            </div>
          </div>

          {/* Messages Container (WhatsApp Style alignment, Dashboard aesthetics) */}
          <div
            ref={chatContainerRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              background: "#f8fafc",
            }}
          >
            {isLoadingChat ? (
              <div style={{ margin: "auto", textAlign: "center", color: "var(--text-secondary)" }}>
                <BrainCircuit size={32} style={{ animation: "pulse 1.5s infinite", color: "var(--accent-primary)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: "0.9rem" }}>Loading conversation history...</p>
              </div>
            ) : filteredChatMessages.length === 0 ? (
              <div style={{ margin: "auto", textAlign: "center", color: "var(--text-secondary)" }}>
                <MessageSquare size={40} style={{ color: "var(--border-color)", margin: "0 auto 12px" }} />
                <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>No messages found</p>
                <p style={{ fontSize: "0.82rem" }}>
                  {chatSearchQuery ? "No messages matching your search query." : "This user has not sent any companion messages yet."}
                </p>
              </div>
            ) : (
              filteredChatMessages.map((msg: any, index: number) => {
                const isAssistant = msg.role === "assistant";
                const prevMsg = filteredChatMessages[index - 1];
                const showDateHeader = !prevMsg || formatDateHeader(prevMsg.createdAt) !== formatDateHeader(msg.createdAt);

                return (
                  <React.Fragment key={msg._id || index}>
                    {showDateHeader && (
                      <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 6px" }}>
                        <span
                          style={{
                            background: "rgba(226, 232, 240, 0.8)",
                            color: "var(--text-secondary)",
                            padding: "3px 12px",
                            borderRadius: 12,
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Calendar size={11} />
                          {formatDateHeader(msg.createdAt)}
                        </span>
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        justifyContent: isAssistant ? "flex-start" : "flex-end",
                        alignItems: "flex-start",
                        gap: 10,
                        width: "100%",
                      }}
                    >
                      {/* Assistant Avatar */}
                      {isAssistant && (
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            flexShrink: 0,
                            marginTop: 2,
                            boxShadow: "0 2px 6px rgba(59,130,246,0.2)",
                          }}
                          title="Emoty AI Assistant"
                        >
                          <BrainCircuit size={17} />
                        </div>
                      )}

                      {/* Message Bubble */}
                      <div
                        style={{
                          maxWidth: "68%",
                          padding: "12px 16px 8px 16px",
                          borderRadius: isAssistant ? "18px 18px 18px 4px" : "18px 18px 4px 18px",
                          background: isAssistant ? "#ffffff" : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                          color: isAssistant ? "var(--text-primary)" : "#ffffff",
                          border: isAssistant ? "1px solid var(--border-color)" : "none",
                          boxShadow: isAssistant
                            ? "0 2px 8px rgba(0, 0, 0, 0.04)"
                            : "0 4px 14px rgba(37, 99, 235, 0.25)",
                          wordBreak: "break-word",
                          position: "relative",
                        }}
                      >
                        {/* Role label for context */}
                        <span
                          style={{
                            display: "block",
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 4,
                            color: isAssistant ? "var(--accent-primary)" : "rgba(255, 255, 255, 0.8)",
                          }}
                        >
                          {isAssistant ? "Emoty AI Companion" : patientInfo?.patientName || "User"}
                        </span>

                        <p style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {msg.content}
                        </p>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: 4,
                            fontSize: "0.68rem",
                            color: isAssistant ? "var(--text-secondary)" : "rgba(255, 255, 255, 0.75)",
                          }}
                        >
                          {formatTimestamp(msg.createdAt)}
                        </div>
                      </div>

                      {/* User Avatar */}
                      {!isAssistant && (
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: "var(--card-bg)",
                            border: "1px solid var(--border-color)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--accent-primary)",
                            fontWeight: 700,
                            fontSize: "0.85rem",
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        >
                          {patientInfo?.patientName ? patientInfo.patientName.charAt(0).toUpperCase() : "U"}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default View: Users List & Overview
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }} className="animate-fade-in">
      
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: 6, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
            AI Safety &amp; Companion Logs
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", margin: 0 }}>
            Review companion conversations, chat history and safety events.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div
          style={{
            display: "inline-flex",
            background: "var(--card-bg)",
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: 4,
            gap: 4,
          }}
        >
          <button
            onClick={() => setActiveTab("users")}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              background: activeTab === "users" ? "var(--accent-primary)" : "transparent",
              color: activeTab === "users" ? "#fff" : "var(--text-secondary)",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s ease",
            }}
          >
            <MessageCircle size={14} /> AI User Conversations ({usersList.length})
          </button>
          <button
            onClick={() => setActiveTab("telemetry")}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              background: activeTab === "telemetry" ? "var(--accent-primary)" : "transparent",
              color: activeTab === "telemetry" ? "#fff" : "var(--text-secondary)",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s ease",
            }}
          >
            <Activity size={14} /> Monitoring activity
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
        {[
          {
            label: "Patients Chatted with AI",
            value: isLoadingUsers ? "—" : stats.totalUsers,
            icon: <MessageSquare size={20} color="var(--accent-primary)" />,
            accent: "var(--accent-primary)",
          },
          {
            label: "Total AI Messages",
            value: isLoadingUsers ? "—" : stats.totalMessages,
            icon: <BrainCircuit size={20} color="var(--accent-secondary)" />,
            accent: "var(--accent-secondary)",
          },
          {
            label: "Active Today",
            value: isLoadingUsers ? "—" : stats.activeToday,
            icon: <Clock size={20} color="var(--success)" />,
            accent: "var(--success)",
          },
          {
            label: "High Risk Flagged",
            value: isLoadingUsers ? "—" : stats.highRiskFlags,
            icon: <AlertTriangle size={20} color="var(--danger)" />,
            accent: "var(--danger)",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="glass-panel"
            style={{
              borderTop: `3px solid ${card.accent}`,
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {card.label}
              </span>
              <div style={{ padding: 7, background: `${card.accent}15`, borderRadius: 9 }}>
                {card.icon}
              </div>
            </div>
            <p style={{ fontSize: "2.2rem", fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      {activeTab === "users" ? (
        <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
          
          {/* Table Header Bar with Search */}
          <div
            style={{
              padding: "18px 24px",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 14,
            }}
          >
            <div>
              <h2 style={{ fontSize: "1rem", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <MessageSquare size={18} color="var(--accent-primary)" />
                Patient AI Chat Directory
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Click 'Open Conversation' on any user to view their complete AI chat transcript.
              </p>
            </div>

            {/* Search Input */}
            <div style={{ position: "relative", minWidth: 280 }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
              <input
                type="text"
                placeholder="Search patient name, ID, or snippet..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 14px 9px 38px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "#f8fafc",
                  fontSize: "0.86rem",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* User Table Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 0.8fr 2.5fr 1fr 1.2fr",
              padding: "12px 24px",
              background: "#f8fafc",
              borderBottom: "1px solid var(--border-color)",
              gap: 12,
            }}
          >
            {["Patient", "ID", "Latest AI Conversation Snippet", "Total Messages", "Action"].map((h, i) => (
              <span
                key={h}
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "var(--text-secondary)",
                  textAlign: i === 4 ? "right" : "left",
                }}
              >
                {h}
              </span>
            ))}
          </div>

          {/* Users List Body */}
          {isLoadingUsers ? (
            <div style={{ padding: "52px 24px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Loading patient AI conversations...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <MessageCircle size={44} style={{ color: "var(--border-color)", margin: "0 auto 12px", display: "block" }} />
              <p style={{ color: "var(--text-primary)", fontSize: "1rem", fontWeight: 600, margin: "0 0 4px" }}>
                No AI companion conversations found
              </p>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>
                {searchQuery ? "Try refining your search query." : "When patients chat with Emoty AI, they will be listed here."}
              </p>
            </div>
          ) : (
            filteredUsers.map((user: any, idx: number) => (
              <div
                key={user.userId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 0.8fr 2.5fr 1fr 1.2fr",
                  alignItems: "center",
                  padding: "16px 24px",
                  gap: 12,
                  borderBottom: idx === filteredUsers.length - 1 ? "none" : "1px solid var(--border-color)",
                  transition: "background 0.15s ease",
                }}
                className="user-row-hover"
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(37,99,235,0.025)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                {/* Patient Name */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "rgba(37,99,235,0.1)",
                      color: "var(--accent-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      flexShrink: 0,
                    }}
                  >
                    {user.patientName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.patientName}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.email}
                    </span>
                  </div>
                </div>

                {/* Patient ID */}
                <div>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      background: "rgba(226, 232, 240, 0.6)",
                      padding: "3px 8px",
                      borderRadius: 6,
                      color: "var(--text-primary)",
                    }}
                  >
                    #{user.patientIdDisplay}
                  </span>
                </div>

                {/* Latest Message Snippet */}
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: "0.84rem", color: "var(--text-primary)", fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    "{user.latestMessageSnippet}"
                  </span>
                  <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Clock size={11} /> Last active {new Date(user.lastActive).toLocaleString()}
                  </span>
                </div>

                {/* Total Messages Count */}
                <div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      borderRadius: 20,
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      background: "rgba(37,99,235,0.08)",
                      color: "var(--accent-primary)",
                      border: "1px solid rgba(37,99,235,0.2)",
                    }}
                  >
                    <MessageSquare size={12} /> {user.messageCount} msgs
                  </span>
                </div>

                {/* Action: Open Conversation Button */}
                <div style={{ textAlign: "right" }}>
                  <button
                    onClick={() => handleOpenConversation(user.userId)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: "var(--accent-primary)",
                      color: "#ffffff",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
                      transition: "transform 0.15s ease, background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "#1d4ed8";
                      (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-primary)";
                      (e.currentTarget as HTMLButtonElement).style.transform = "none";
                    }}
                  >
                    Open Conversation
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Monitoring records view */
        <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
          
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2 style={{ fontSize: "0.95rem", display: "flex", alignItems: "center", gap: 10, margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-primary)" }}>
              <BrainCircuit size={18} color="var(--accent-primary)" />
              AI safety records
            </h2>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(37,99,235,0.07)",
                border: "1px solid rgba(37,99,235,0.18)",
                color: "var(--accent-primary)",
                borderRadius: 8,
                padding: "5px 12px",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              <Activity size={12} />
              Recent records
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr 3fr 1.2fr 1fr",
              padding: "10px 24px",
              background: "#f8fafc",
              borderBottom: "1px solid var(--border-color)",
              gap: 12,
            }}
          >
            {["Timestamp", "Patient", "Prompt & AI Response", "Risk Score", "Status"].map((h, i) => (
              <span
                key={h}
                style={{
                  fontSize: "0.67rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "var(--text-secondary)",
                  textAlign: i === 4 ? "right" : "left",
                }}
              >
                {h}
              </span>
            ))}
          </div>

          {telemetryLogs === undefined ? (
            <div style={{ padding: "52px 24px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Loading monitoring records...
            </div>
          ) : telemetryLogs.length === 0 ? (
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <ShieldAlert size={40} style={{ color: "var(--border-color)", margin: "0 auto 12px", display: "block" }} />
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>No AI safety logs recorded.</p>
            </div>
          ) : (
            telemetryLogs.map((log: any, idx: number) => (
              <div
                key={log._id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr 3fr 1.2fr 1fr",
                  alignItems: "center",
                  padding: "14px 24px",
                  gap: 12,
                  borderBottom: idx === telemetryLogs.length - 1 ? "none" : "1px solid var(--border-color)",
                  background: log.riskScore > 70 ? "rgba(239,68,68,0.018)" : "transparent",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Clock size={13} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                  <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>

                <div>
                  <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                    {log.patientName}
                  </span>
                </div>

                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: "block", fontSize: "0.85rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    "{log.prompt}"
                  </span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ↳ "{log.aiResponse}"
                  </span>
                </div>

                <div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 10px",
                      borderRadius: 20,
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: log.riskScore > 70 ? "rgba(239,68,68,0.1)" : log.riskScore > 40 ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)",
                      color: log.riskScore > 70 ? "var(--danger)" : log.riskScore > 40 ? "var(--warning)" : "var(--success)",
                      border: `1px solid ${log.riskScore > 70 ? "var(--danger)" : log.riskScore > 40 ? "var(--warning)" : "var(--success)"}40`,
                    }}
                  >
                    {log.riskScore} / 100
                  </span>
                </div>

                <div style={{ textAlign: "right" }}>
                  {log.reviewed ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: "rgba(16,185,129,0.1)", color: "var(--success)" }}>
                      <ShieldCheck size={11} /> Reviewed
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}>
                      <Clock size={11} /> Pending
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
