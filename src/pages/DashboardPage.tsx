import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PoolCard } from '../components/PoolCard';
import { useAuth } from '../hooks/useAuth';
import { deletePool, listUserPools } from '../services/pools.service';
import { getSupabaseErrorMessage } from '../services/supabase-error';
import type { PoolSummary } from '../services/pools.service';

export function DashboardPage() {
  const { user } = useAuth();
  const [pools, setPools] = useState<PoolSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingPoolId, setDeletingPoolId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    const currentUserId = user.id;
    let active = true;

    async function loadPools() {
      try {
        setLoading(true);
        setError(null);
        const userPools = await listUserPools(currentUserId);
        if (active) {
          setPools(userPools);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar bolões.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPools();

    return () => {
      active = false;
    };
  }, [user]);

  async function handleDeletePool(pool: PoolSummary) {
    const confirmed = window.confirm(`Excluir o bolão "${pool.name}"? Essa ação remove jogos, participantes e palpites vinculados.`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingPoolId(pool.id);
      setError(null);
      await deletePool(pool.id);
      setPools((currentPools) => currentPools.filter((currentPool) => currentPool.id !== pool.id));
    } catch (deleteError) {
      setError(getSupabaseErrorMessage(deleteError));
    } finally {
      setDeletingPoolId(null);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Seus bolões</h1>
        </div>
        <div className="actions">
          <Link to="/pools/new" className="button">
            Criar bolão
          </Link>
          <Link to="/pools/join" className="button secondary">
            Entrar por código
          </Link>
        </div>
      </div>

      {loading ? <div className="center-card">Carregando bolões...</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
      {!loading && !error && pools.length === 0 ? (
        <div className="empty-state">Você ainda não participa de nenhum bolão.</div>
      ) : null}

      <div className="cards-grid">
        {pools.map((pool) => (
          <PoolCard key={pool.id} pool={pool} deleting={deletingPoolId === pool.id} onDelete={handleDeletePool} />
        ))}
      </div>
    </Layout>
  );
}
