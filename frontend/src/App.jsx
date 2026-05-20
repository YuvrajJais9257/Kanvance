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

            {/* Protected */}
            <Route path="/dashboard" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />
            <Route path="/" element={
              <ProtectedRoute><Projects /></ProtectedRoute>
            } />
            <Route path="/customers" element={
              <ProtectedRoute><Customers /></ProtectedRoute>
            } />
            <Route path="/my-tasks" element={
              <ProtectedRoute><MyTasks /></ProtectedRoute>
            } />
            <Route path="/users" element={
              <ProtectedRoute><Users /></ProtectedRoute>
            } />
            <Route path="/access" element={
              <ProtectedRoute><AccessManagement /></ProtectedRoute>
            } />
            <Route path="/reports" element={
              <ProtectedRoute><Reports /></ProtectedRoute>
            } />
            <Route path="/analytics" element={
              <ProtectedRoute><Analytics /></ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </Router>
    </ErrorProvider>
  );
}

export default App;
