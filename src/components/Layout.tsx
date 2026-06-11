import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from '../services/auth.service';
import { useAuth } from '../hooks/useAuth';

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/dashboard" className="brand">
          <img src="/hexa-vem-logo.png" alt="" />
          <span>Hexa Vem</span>
        </Link>
        {user ? (
          <div className="user-menu">
            <span>{user.user_metadata.name ?? user.email}</span>
            <button type="button" className="button ghost" onClick={handleSignOut}>
              Sair
            </button>
          </div>
        ) : null}
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
