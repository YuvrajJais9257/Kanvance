import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Projects          from './components/Projects/Projects';
import Dashboard         from './components/Dashboard/Dashboard';
import Customers         from './components/Customers/Customers';
import MyTasks           from './components/MyTasks/MyTasks';
import Users             from './components/Users/Users';
import AccessManagement  from './components/AccessManagement/AccessManagement';
import Reports           from './components/Reports/Reports';
import Analytics         from './components/Analytics/Analytics';
import Login             from './components/Login/Login';
import NotificationsPage from './components/Notifications/NotificationsPage';
import ProtectedRoute    from './components/ProtectedRoute';
import { ErrorProvider } from './context/ErrorContext';
import { AuthProvider }  from './context/AuthContext';

function App() {
  return (
    <ErrorProvider>
      <Router>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />

            {/* PREVIEW MODE - Auth bypassed for design preview */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/" element={<Projects />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/my-tasks" element={<MyTasks />} />
            <Route path="/users" element={<Users />} />
            <Route path="/access" element={<AccessManagement />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/notifications" element={<NotificationsPage />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </Router>
    </ErrorProvider>
  );
}

export default App;
