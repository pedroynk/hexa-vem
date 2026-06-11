import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CreatePoolPage } from './pages/CreatePoolPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { DashboardPage } from './pages/DashboardPage';
import { JoinPoolPage } from './pages/JoinPoolPage';
import { LoginPage } from './pages/LoginPage';
import { PoolPage } from './pages/PoolPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/pools/new" element={<CreatePoolPage />} />
        <Route path="/pools/join" element={<JoinPoolPage />} />
        <Route path="/pools/:poolId" element={<PoolPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
