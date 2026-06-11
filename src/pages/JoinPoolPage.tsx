import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { joinPoolByCode } from '../services/pools.service';

export function JoinPoolPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!code.trim()) {
      setError('Informe o código do bolão.');
      return;
    }

    try {
      setSubmitting(true);
      const poolId = await joinPoolByCode(code);
      navigate(`/pools/${poolId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao entrar no bolão.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <section className="form-page">
        <div>
          <p className="eyebrow">Participar</p>
          <h1>Entrar em bolão</h1>
        </div>
        <form className="card form-card" onSubmit={handleSubmit}>
          <label>
            Código do bolão
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABC123"
              autoCapitalize="characters"
            />
          </label>
          <button type="submit" className="button large" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar no bolão'}
          </button>
          {error ? <p className="error-text">{error}</p> : null}
        </form>
      </section>
    </Layout>
  );
}
