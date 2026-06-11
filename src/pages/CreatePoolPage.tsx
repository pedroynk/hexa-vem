import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { createPool } from '../services/pools.service';

export function CreatePoolPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [ticketValue, setTicketValue] = useState('20');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedTicketValue = Number(ticketValue);
    if (!name.trim() || Number.isNaN(parsedTicketValue) || parsedTicketValue <= 0) {
      setError('Informe nome e valor de entrada válidos.');
      return;
    }

    try {
      setSubmitting(true);
      const poolId = await createPool(name.trim(), parsedTicketValue);
      navigate(`/pools/${poolId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao criar bolão.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <section className="form-page">
        <div>
          <p className="eyebrow">Novo bolão</p>
          <h1>Criar bolão</h1>
        </div>
        <form className="card form-card" onSubmit={handleSubmit}>
          <label>
            Nome do bolão
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Família 2026" />
          </label>
          <label>
            Valor da entrada
            <input
              type="number"
              min="1"
              step="0.01"
              value={ticketValue}
              onChange={(event) => setTicketValue(event.target.value)}
            />
          </label>
          <button type="submit" className="button large" disabled={submitting}>
            {submitting ? 'Criando...' : 'Criar bolão'}
          </button>
          {error ? <p className="error-text">{error}</p> : null}
        </form>
      </section>
    </Layout>
  );
}
