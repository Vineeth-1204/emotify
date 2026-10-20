import { Bell, Check, AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { DASHBOARD_DESTINATION_ROUTES, isNotificationDestination } from "../../../common/notificationRoutes";

export default function Notifications() {
  const notifications = useQuery(api.dashboard.getNotifications);
  const markRead = useMutation(api.dashboard.markNotificationRead);
  const unread = useQuery(api.notificationCenter.unreadCount, {});
  const markAllRead = useMutation(api.notificationCenter.markAllRead);
  const openNotification = useMutation(api.notificationCenter.openNotification);
  const navigate = useNavigate();

  // Opening re-checks on the server where this user may go now (e.g. after a reassignment).
  const open = async (id: any) => {
    try {
      const { destination } = await openNotification({ notificationId: id });
      if (isNotificationDestination(destination) && destination !== "notifications") navigate(DASHBOARD_DESTINATION_ROUTES[destination]);
    } catch {
      // Stays on this page.
    }
  };
  const markAll = async () => {
    for (let i = 0; i < 10; i++) {
      const res = await markAllRead({}).catch(() => null);
      if (!res?.remaining) break;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }} className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "2.4rem", marginBottom: "8px", color: "var(--text-primary)" }}>
            Notifications
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem" }}>
            Alerts, counsellor requests and important system updates.
          </p>
        </div>
      </div>

      <div className="glass-panel hud-panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", background: "#ffffff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "10px", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <Bell size={20} color="var(--accent-primary)" />
            Recent notifications
            {unread && unread.count > 0 && <span className="badge" style={{ marginLeft: 8 }}>{unread.capped ? "99+" : unread.count} unread</span>}
          </h2>
          {unread && unread.count > 0 && (
            <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={markAll}>
              <Check size={14} /> Mark all as read
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {notifications === undefined ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>All caught up! No unread notifications.</div>
          ) : (
            notifications.map((n: any) => (
              <div
                key={n._id}
                style={{
                  padding: "20px 24px",
                  borderBottom: "1px solid var(--border-color)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: n.read ? "transparent" : "rgba(99, 102, 241, 0.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <div style={{ padding: "10px", borderRadius: "10px", background: n.priority === "critical" ? "rgba(244,63,94,0.1)" : "rgba(99,102,241,0.1)", color: n.priority === "critical" ? "var(--danger)" : "var(--accent-primary)" }}>
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: "1.02rem", fontWeight: 700 }}>{n.title}</h3>
                    <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)" }}>{n.message}</p>
                    <span style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "6px", display: "inline-block" }}>
                      <Clock size={12} style={{ display: "inline", marginRight: "4px" }} />
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {n.destination && n.destination !== "notifications" && (
                    <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => open(n._id)}>
                      Open <ArrowRight size={14} />
                    </button>
                  )}
                  {!n.read && (
                    <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => markRead({ notificationId: n._id })}>
                      <Check size={14} /> Mark Read
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
