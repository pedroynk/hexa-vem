import { Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { signInWithGoogle } from '../services/auth.service';

export function LoginPage() {
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleLogin() {
    try {
      setSubmitting(true);
      setError(null);
      await signInWithGoogle();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Erro ao iniciar login.');
      setSubmitting(false);
    }
  }

  return (
    <section className="landing">
      <div className="hero-copy">
        <img className="hero-logo" src="/hexa-vem-logo.png" alt="Hexa Vem" />
        <p className="eyebrow">Copa do Mundo</p>
        <h1>Bolão dos jogos do Brasil.</h1>
        <p>
          Entre com Google, crie seu bolão, compartilhe o código e acompanhe palpites, pagamentos, vencedores e
          ranking.
        </p>
        <button type="button" className="button large" onClick={() => void handleLogin()} disabled={submitting}>
          {submitting ? 'Abrindo Google...' : 'Entrar com Google'}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </section>
  );
}
