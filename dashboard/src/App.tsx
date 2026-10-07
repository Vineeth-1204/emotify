import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDashboardAuth } from './components/AuthContext';
import DashboardLayout from './layouts/DashboardLayout';
import Overview from './pages/Overview';
import PatientsList from './pages/PatientsList';
import PatientDetail from './pages/PatientDetail';
import AlertsCenter from './pages/AlertsCenter';
import Sessions from './pages/Sessions';
import ScreeningCentre from './pages/ScreeningCentre';
import AiMonitoring from './pages/AiMonitoring';
import Notifications from './pages/Notifications';
import Analytics from './pages/Analytics';
import SystemSettingsPage from './pages/Settings';
import TrashBin from './pages/TrashBin';
import CounsellorRequests from './pages/CounsellorRequests';


import Login from './pages/Login';
import React from 'react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useDashboardAuth();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        background: 'var(--bg-color)',
        fontSize: '1.2rem',
        fontWeight: 500
      }}>
        Loading staff workspace…
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useDashboardAuth();
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Routes>
                <Route path="/" element={<DashboardLayout />}>
                  <Route index element={<Overview />} />
                  <Route path="patients" element={<PatientsList />} />
                  <Route path="patients/:id" element={<PatientDetail />} />
                  <Route path="alerts" element={<AlertsCenter />} />
                  <Route path="sessions" element={<Sessions />} />

                  <Route path="screenings" element={<ScreeningCentre />} />
                  <Route path="requests" element={<CounsellorRequests />} />
                  <Route path="ai-monitoring" element={<AdminRoute><AiMonitoring /></AdminRoute>} />
                  <Route path="notifications" element={<Notifications />} />
                </Route>
              </Routes>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}


export default App;

