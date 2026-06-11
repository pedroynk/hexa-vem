import { Link } from 'react-router-dom';
import type { PoolSummary } from '../services/pools.service';
import { formatCurrency } from '../utils/date';

type PoolCardProps = {
  pool: PoolSummary;
  deleting?: boolean;
  onDelete?: (pool: PoolSummary) => void;
};

export function PoolCard({ pool, deleting = false, onDelete }: PoolCardProps) {
  return (
    <article className="card pool-card">
      <div className="pool-card-header">
        <span className="pool-code">Código {pool.code}</span>
        <span className={`pill pill-${pool.member_status?.toLowerCase() ?? 'pendente'}`}>{pool.member_status ?? pool.status}</span>
      </div>
      <div className="pool-card-body">
        <p className="eyebrow">Bolão</p>
        <h3>{pool.name}</h3>
        <div className="pool-ticket">
          <span>Entrada</span>
          <strong>{formatCurrency(pool.ticket_value)}</strong>
        </div>
      </div>
      <div className="pool-card-meta">
        <span>{pool.status}</span>
        {pool.role ? <span>{pool.role}</span> : null}
      </div>
      <div className="pool-card-actions">
        <Link to={`/pools/${pool.id}`} className="button">
          Abrir bolão
        </Link>
        {pool.role === 'ADMIN' && onDelete ? (
          <button type="button" className="button ghost danger-outline" disabled={deleting} onClick={() => onDelete(pool)}>
            {deleting ? 'Excluindo...' : 'Excluir'}
          </button>
        ) : null}
      </div>
    </article>
  );
}
