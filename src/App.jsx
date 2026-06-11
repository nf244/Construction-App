import { HashRouter, Routes, Route, Link, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext.jsx';
import { ROLE_LABELS } from './services/auth.js';
import { isOwnerLevel } from './services/roles.js';
import AuthPage from './pages/AuthPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewJobPage from './pages/NewJobPage.jsx';
import JobDetailPage from './pages/JobDetailPage.jsx';
import PeoplePage from './pages/PeoplePage.jsx';
import AdminSetupPage from './pages/AdminSetupPage.jsx';
import Avatar from './components/Avatar.jsx';

function Shell() {
  const { user, booting, logout } = useApp();
  const location = useLocation();

  if (booting) return <div className="page-loading">Loading SiteTrack…</div>;
  // Admin setup is accessible whether logged in or not — must be checked
  // via useLocation so React Router re-evaluates on hash navigation.
  if (location.pathname === '/system-setup') return <AdminSetupPage />;
  if (!user) return <AuthPage />;

  return (
    <>
      <header className="topbar">
        <Link to="/" className="topbar-brand">
          🏗️ SiteTrack
        </Link>
        <div className="topbar-user">
          <Avatar name={user.name} size={32} />
          <div className="topbar-user-info">
            <strong>{user.name}</strong>
            <small>{ROLE_LABELS[user.role]}</small>
          </div>
          <button className="btn btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
        <nav className="topbar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'topbar-link active' : 'topbar-link'}>
            Jobs
          </NavLink>
          {isOwnerLevel(user.role) && (
            <NavLink to="/people" className={({ isActive }) => isActive ? 'topbar-link active' : 'topbar-link'}>
              People
            </NavLink>
          )}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs/new" element={<NewJobPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/system-setup" element={<AdminSetupPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AppProvider>
  );
}
