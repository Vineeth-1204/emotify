import { useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { AlertTriangle, Bell, Bug, CalendarDays, MessageSquare, ShieldAlert, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { LoadingState } from "../components/UIComponents";

/** Admin: daily beta summary (activity, errors, notifications, safety, feedback). Counts only. */

const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const panel: React.CSSProperties = { padding: 20, marginBottom: 20 };
const h2: React.CSSProperties = { fontSize: "1.05rem", color: "var(--text-primary)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: "0.78rem", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-color, #E5E7EB)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: "0.88rem", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color, #F1F5F9)", verticalAlign: "top" };
const muted: React.CSSProperties = { color: "var(--text-secondary)", fontSize: "0.85rem" };

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone?: "warn" | "danger" }) {
  const color = tone === "danger" ? "#DC2626" : tone === "warn" ? "#D97706" : "var(--text-primary)";
  return (
    <div className="glass-panel" style={{ padding: 16, flex: "1 1 160px", minWidth: 160 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...muted }}>{icon}{label}</div>
      <div style={{ fontSize: "1.8rem", fontWeight: 700, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function CountList({ data, empty }: { data: Record<string, number>; empty: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <p style={muted}>{empty}</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {entries.map(([k, n]) => (
          <tr key={k}>
            <td style={td}>{k}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BetaReport() {
  const [date, setDate] = useState(localToday());
  const tzOffsetMinutes = useMemo(() => new Date(`${date}T12:00:00`).getTimezoneOffset(), [date]);
  const report = useQuery(api.betaReport.getDailySummary, { date, tzOffsetMinutes });
  const allFeedback = usePaginatedQuery(api.betaFeedback.listAll, {}, { initialNumItems: 20 });

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: 6, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>Beta report</h1>
          <p style={muted}>Daily summary of the test: who used what, errors, notifications, safety alerts and feedback. Counts only — no answers or messages from the app.</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, ...muted }}>
          <CalendarDays size={16} /> Day
          <input type="date" value={date} max={localToday()} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #CBD5E1" }} />
        </label>
      </div>

      {report === undefined ? (
        <LoadingState />
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <Stat icon={<Users size={16} />} label="Active students" value={report.activity.activeStudents} />
            <Stat icon={<ShieldAlert size={16} />} label="Safety alerts today" value={report.safety.alertsCreated} tone={report.safety.alertsCreated ? "danger" : undefined} />
            <Stat icon={<AlertTriangle size={16} />} label="Open alerts (now)" value={report.safety.openAlertsNow} tone={report.safety.openAlertsNow ? "warn" : undefined} />
            <Stat icon={<Bug size={16} />} label="AI fallbacks / failures" value={`${report.errors.ai.fallbacks} / ${report.errors.ai.geminiFailures}`} tone={report.errors.ai.geminiFailures ? "warn" : undefined} />
            <Stat icon={<Bell size={16} />} label="Push failures" value={report.errors.pushFailures} tone={report.errors.pushFailures ? "warn" : undefined} />
            <Stat icon={<MessageSquare size={16} />} label="Feedback" value={report.feedback.length} />
          </div>

          {report.truncated.length > 0 && (
            <p className="badge badge-yellow" style={{ marginBottom: 16 }}>Some tables hit the row limit and are incomplete: {report.truncated.join(", ")}</p>
          )}

          {report.feedback.length > 0 && (
            <section className="glass-panel" style={panel} aria-labelledby="fb-today">
              <h2 id="fb-today" style={h2}><MessageSquare size={18} /> Feedback on this day</h2>
              {report.feedback.map((f: any, i: number) => (
                <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #F1F5F9" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", ...muted }}>
                    {f.flagged && <span className="badge badge-red">Crisis language – check on this person</span>}
                    <span className="badge badge-orange">{f.category}</span>
                    <span>{f.from}</span>
                    {f.screen && <span>· {f.screen}</span>}
                    <span>· {new Date(f.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p style={{ marginTop: 6, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{f.message}</p>
                </div>
              ))}
            </section>
          )}

          <section className="glass-panel" style={panel} aria-labelledby="who-title">
            <h2 id="who-title" style={h2}><Users size={18} /> Who used what</h2>
            {report.activity.users.length === 0 ? (
              <p style={muted}>No activity on this day.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Person</th>
                      <th style={th}>Total</th>
                      <th style={th}>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.activity.users.map((u) => (
                      <tr key={u.id}>
                        <td style={td}>
                          <strong>{u.name}</strong>
                          <div style={muted}>{u.label}</div>
                        </td>
                        <td style={{ ...td, fontWeight: 600 }}>{u.total}</td>
                        <td style={td}>
                          {Object.entries(u.activity)
                            .sort((a, b) => b[1] - a[1])
                            .map(([k, n]) => `${report.activity.labels[k] ?? k} ${n}`)
                            .join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
            <section className="glass-panel" style={panel} aria-labelledby="features-title">
              <h2 id="features-title" style={h2}>Features used (people / times)</h2>
              {Object.keys(report.activity.totals).length === 0 ? (
                <p style={muted}>Nothing used on this day.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {Object.entries(report.activity.totals)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, n]) => (
                        <tr key={k}>
                          <td style={td}>{report.activity.labels[k] ?? k}</td>
                          <td style={{ ...td, textAlign: "right" }}>{report.activity.featureUsers[k] ?? 0}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{n}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="glass-panel" style={panel} aria-labelledby="safety-title">
              <h2 id="safety-title" style={h2}><ShieldAlert size={18} /> Safety</h2>
              <p style={muted}>Alerts by type</p>
              <CountList data={report.safety.byType} empty="No safety alerts on this day." />
              <p style={{ ...muted, marginTop: 12 }}>Alerts by status</p>
              <CountList data={report.safety.byStatus} empty="—" />
              <p style={{ ...muted, marginTop: 12 }}>Emergency-contact SMS (test mode unless Twilio is configured)</p>
              <CountList data={report.safety.emergencyContactDispatch} empty="None." />
              <p style={{ ...muted, marginTop: 12 }}>
                Urgent support requests: <strong>{report.safety.emergencyRequests}</strong> · Alerts with no staff to notify: <strong>{report.safety.noRecipientAlerts}</strong>
              </p>
            </section>

            <section className="glass-panel" style={panel} aria-labelledby="notif-title">
              <h2 id="notif-title" style={h2}><Bell size={18} /> Notifications</h2>
              <p style={muted}>Created {report.notifications.created} · read {report.notifications.read}</p>
              <p style={{ ...muted, marginTop: 12 }}>Phone push by status</p>
              <CountList data={report.notifications.pushByStatus} empty="No push notifications." />
              <p style={{ ...muted, marginTop: 12 }}>Push errors</p>
              <CountList data={report.notifications.pushErrors} empty="None." />
            </section>

            <section className="glass-panel" style={panel} aria-labelledby="errors-title">
              <h2 id="errors-title" style={h2}><Bug size={18} /> Errors</h2>
              <p style={muted}>
                AI requests {report.errors.ai.requests} · Gemini calls {report.errors.ai.geminiCalls} · failures {report.errors.ai.geminiFailures} · fallbacks {report.errors.ai.fallbacks} · rate-limited {report.errors.ai.rateLimited}
              </p>
              <p style={{ ...muted, marginTop: 12 }}>AI error codes</p>
              <CountList data={report.errors.ai.byErrorCode} empty="None." />
              <p style={{ ...muted, marginTop: 12 }}>Problems in the audit log</p>
              <CountList data={report.errors.auditProblems} empty="None." />
              <p style={{ ...muted, marginTop: 12 }}>{report.errors.note}</p>
            </section>
          </div>
        </>
      )}

      <section className="glass-panel" style={panel} aria-labelledby="all-fb-title">
        <h2 id="all-fb-title" style={h2}><MessageSquare size={18} /> All feedback</h2>
        {allFeedback.results.length === 0 ? (
          <p style={muted}>{allFeedback.status === "LoadingFirstPage" ? "Loading…" : "No feedback yet."}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>When</th>
                  <th style={th}>From</th>
                  <th style={th}>Type</th>
                  <th style={th}>Feedback</th>
                  <th style={th}>Screen / build</th>
                </tr>
              </thead>
              <tbody>
                {allFeedback.results.map((f) => (
                  <tr key={f._id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{new Date(f.createdAt).toLocaleString()}</td>
                    <td style={td}>{f.from}</td>
                    <td style={td}>
                      {f.flagged && <span className="badge badge-red" style={{ marginRight: 6 }}>Crisis language</span>}
                      {f.category}
                    </td>
                    <td style={{ ...td, whiteSpace: "pre-wrap", maxWidth: 480 }}>{f.message}</td>
                    <td style={{ ...td, ...muted }}>{[f.screen, f.platform, f.appVersion].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {allFeedback.status === "CanLoadMore" && (
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => allFeedback.loadMore(20)}>
            Load more
          </button>
        )}
      </section>
    </div>
  );
}
