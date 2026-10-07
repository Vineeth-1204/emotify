import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  HeartPulse,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, LoadingState } from "../components/UIComponents";
import EnrollPatientModal from "../components/EnrollPatientModal";

function getAlertTitle(type: string) {
  if (type === "suicideRisk" || type === "suicide") return "Suicide risk alert";
  if (type === "psychosisRisk" || type === "psychosis") return "Psychosis risk alert";
  if (type === "counselor_request") return "Counsellor request";
  return `${type.charAt(0).toUpperCase()}${type.slice(1).replace(/_/g, " ")} alert`;
}

export default function Overview() {
  const data = useQuery(api.dashboard.getDashboardOverview);
  const feed = useQuery(api.dashboard.getActivityFeed);
  const alerts = useQuery(api.dashboard.getAlerts);
  const allAppointments = useQuery(api.appointments.listAllTwoWayAppointments);

  const [showEnrollModal, setShowEnrollModal] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];
  const todaysAppointments = allAppointments?.filter((appointment) => appointment.date === todayStr) || [];
  const chartData = data?.trendData?.length ? data.trendData : [];
  const openAlerts = (alerts || [])
    .filter((alert) => alert.status === "active" || alert.status === "pending" || alert.status === "escalated")
    .slice(0, 4);

  if (data === undefined || feed === undefined || alerts === undefined) {
    return <LoadingState message="Loading your counsellor overview…" />;
  }

  return (
    <div className="overview-page animate-fade-in">
      <section className="overview-heading">
        <div>
          <p className="overview-eyebrow">Workspace</p>
          <h1>Counsellor Dashboard</h1>
          <p>Review student wellbeing, alerts and sessions in one place.</p>
        </div>
        <div className="overview-actions">
          <Link className="btn btn-secondary" to="/alerts">
            <AlertTriangle size={17} /> Review alerts
          </Link>
          <button className="btn btn-primary" onClick={() => setShowEnrollModal(true)}>
            <UserPlus size={17} /> Add student
          </button>
        </div>
      </section>

      <section aria-labelledby="overview-metrics-title">
        <h2 className="overview-section-heading" id="overview-metrics-title">At a glance</h2>
        <div className="overview-metrics">
          <article className="overview-metric-card">
            <div className="overview-metric-icon"><HeartPulse size={20} /></div>
            <div>
              <p className="overview-metric-label">Students</p>
              <p className="overview-metric-value">{data?.totalPatients ?? 0}</p>
              <p className="overview-metric-note">Registered accounts</p>
            </div>
          </article>

          <article className="overview-metric-card">
            <div className="overview-metric-icon priority"><AlertTriangle size={20} /></div>
            <div>
              <p className="overview-metric-label">Students with high-risk triage</p>
              <p className="overview-metric-value">{data?.severeCases ?? 0}</p>
              <p className="overview-metric-note">Latest severe or flagged triage</p>
            </div>
          </article>

          <article className="overview-metric-card">
            <div className="overview-metric-icon attention"><Activity size={20} /></div>
            <div>
              <p className="overview-metric-label">Open alerts</p>
              <p className="overview-metric-value">{data?.activeAlertsCount ?? 0}</p>
              <p className="overview-metric-note">Pending, active or escalated</p>
            </div>
            <Link className="overview-card-link" to="/alerts" aria-label="Review open alerts">→</Link>
          </article>
        </div>
      </section>

      <section className="overview-attention" aria-labelledby="attention-title">
        <div className="overview-attention-heading">
          <div>
            <h2 id="attention-title">Needs your attention</h2>
            <p>Open alerts for staff review.</p>
          </div>
          <Link to="/alerts">View all alerts <span aria-hidden="true">→</span></Link>
        </div>
        {openAlerts.length === 0 ? (
          <div className="overview-attention-empty">
            <CheckCircle2 size={19} aria-hidden="true" />
            <span>No open alerts right now.</span>
          </div>
        ) : (
          <div className="overview-attention-list">
            {openAlerts.map((alert) => (
              <Link className="overview-attention-item" to="/alerts" key={alert._id}>
                <span className={`overview-attention-marker ${alert.type === "suicideRisk" || alert.type === "suicide" ? "urgent" : alert.type === "psychosisRisk" || alert.type === "psychosis" ? "priority" : "standard"}`} aria-hidden="true">
                  <AlertTriangle size={16} />
                </span>
                <span className="overview-attention-copy">
                  <strong>{getAlertTitle(alert.type)}</strong>
                  <span>{alert.patientName || "Student"} · {alert.status || "active"}</span>
                </span>
                <time dateTime={new Date(alert.createdAt).toISOString()}>{new Date(alert.createdAt).toLocaleDateString()}</time>
              </Link>
            ))}
          </div>
        )}
      </section>

      {showEnrollModal && <EnrollPatientModal onClose={() => setShowEnrollModal(false)} />}

      <div className="overview-content-grid">
        <section className="glass-panel overview-panel" aria-labelledby="activity-title">
          <div className="overview-panel-heading">
            <div>
              <h2 id="activity-title">Recent Activity</h2>
              <p>Recent check-ins, alerts and completed activities.</p>
            </div>
            <Activity size={19} aria-hidden="true" />
          </div>

          <div className="overview-activity-list">
            {feed.length === 0 ? (
              <EmptyState title="No recent activity" description="Updates will appear here as students check in and alerts are recorded." />
            ) : feed.slice(0, 6).map((item) => (
              <article className="overview-activity-item" key={item.id}>
                <span className={`overview-activity-marker ${item.severity || "info"}`} aria-hidden="true">
                  {item.type === "alert" ? <AlertTriangle size={15} /> : item.type === "goal" ? <CheckCircle2 size={15} /> : <Activity size={15} />}
                </span>
                <div className="overview-activity-copy">
                  <div className="overview-activity-title-row">
                    <h3>{item.title}</h3>
                    <time dateTime={new Date(item.time).toISOString()}>
                      <Clock size={12} aria-hidden="true" />
                      {new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </div>
                  <p>{item.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="glass-panel overview-panel" aria-labelledby="trends-title">
          <div className="overview-panel-heading">
            <div>
              <h2 id="trends-title">Screening &amp; triage trends</h2>
              <p>Recorded triage levels over the last seven days.</p>
            </div>
            <TrendingUp size={19} aria-hidden="true" />
          </div>
          <div className="overview-chart">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#8290a0" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                  <YAxis stroke="#8290a0" fontSize={11} tickLine={false} axisLine={false} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8edf2" vertical={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="severe" name="Severe" stroke="#bd6268" fill="#f4e5e6" strokeWidth={2} />
                  <Area type="monotone" dataKey="moderate" name="Moderate" stroke="#bd8b50" fill="#f5eee2" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No trend data yet" description="Trend data will appear as triage records are added." />
            )}
          </div>
        </section>
      </div>

      <section className="glass-panel overview-panel overview-schedule" aria-labelledby="today-sessions-title">
        <div className="overview-panel-heading">
          <div>
            <h2 id="today-sessions-title">Today’s sessions <span className="overview-count">{todaysAppointments.length}</span></h2>
            <p>Appointments scheduled for today.</p>
          </div>
          <Calendar size={19} aria-hidden="true" />
        </div>
        {todaysAppointments.length === 0 ? (
          <EmptyState title="No sessions scheduled today" />
        ) : (
          <div className="overview-session-list">
            {todaysAppointments.map((appointment) => (
              <article className="overview-session-item" key={appointment._id}>
                <div className="overview-session-icon"><Calendar size={18} /></div>
                <div className="overview-session-copy">
                  <h3>{appointment.patientName} — {appointment.title}</h3>
                  <p>{appointment.reason || "Routine check-in"}</p>
                </div>
                <time>{appointment.time}</time>
                <span className="badge badge-blue">{appointment.status}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
