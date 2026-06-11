import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const DEFAULT_REDIRECT_PATH = '/dashboard';

function getSafeRedirectPath(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return DEFAULT_REDIRECT_PATH;
  }

  return path;
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function completeSignIn() {
      const code = searchParams.get('code');

      if (!code) {
        setError('Nao foi possivel confirmar o login. Tente entrar novamente.');
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        if (mounted) {
          setError(exchangeError.message);
        }

        return;
      }

      if (mounted) {
        navigate(getSafeRedirectPath(searchParams.get('next')), { replace: true });
      }
    }

    void completeSignIn();

    return () => {
      mounted = false;
    };
  }, [navigate, searchParams]);

  if (error) {
    return (
      <section className="landing">
        <div className="hero-copy">
          <p className="eyebrow">Login</p>
          <h1>Nao foi possivel entrar.</h1>
          <p className="error-text">{error}</p>
          <Link className="button large" to="/login" replace>
            Tentar novamente
          </Link>
        </div>
      </section>
    );
  }

  return <div className="center-card">Concluindo login...</div>;
}
