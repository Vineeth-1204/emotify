import { Outlet, NavLink } from "react-router-dom";
import { useDashboardAuth } from "../components/AuthContext";
import {
  Activity,
  AlertTriangle,
  Bell,
  BrainCircuit,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";

export default function DashboardLayout() {
  const { user, logout } = useDashboardAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-brand">
            <Activity aria-hidden="true" size={24} />
            EMOTIFY
          </h1>
          <p>Staff workspace</p>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <span className="nav-section-label">Workspace</span>
          <NavLink to="/" end className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <LayoutDashboard size={18} /> Overview
          </NavLink>
          <NavLink to="/patients" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Users size={18} /> Students
          </NavLink>
          <NavLink to="/alerts" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <AlertTriangle size={18} /> Alerts
          </NavLink>
          <NavLink to="/sessions" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <CalendarDays size={18} /> Appointments &amp; sessions
          </NavLink>

          <span className="nav-section-label nav-section-spaced">Clinical review</span>
          <NavLink to="/screenings" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <FileText size={18} /> Screening
          </NavLink>
          <NavLink to="/ai-monitoring" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <BrainCircuit size={18} /> AI Monitoring
          </NavLink>

          <span className="nav-section-label nav-section-spaced">Updates</span>
          <NavLink to="/notifications" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Bell size={18} /> Notifications
          </NavLink>
        </nav>
      </aside>

      <main className="main-content">
        <header className="header">
          <p className="header-context">Counsellor workspace</p>
          <div className="header-actions">
            <span className="header-user" title={user?.full_name || "Staff account"}>
              {user?.full_name || "Staff account"}
            </span>
            <NavLink to="/notifications" className="header-icon-button" aria-label="Notifications" title="Notifications">
              <Bell size={18} />
            </NavLink>
            <button onClick={logout} className="btn btn-secondary header-logout">
              <LogOut size={15} /> Log out
            </button>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
