import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { addMatchToPool, checkMatchResult, listAvailableMatches, removeMatchFromPool, syncMatchesFromApi } from '../services/matches.service';
import { confirmMemberPayment, removePoolMember, restorePoolMember, undoMemberPayment } from '../services/members.service';
import type { Match, Pool, PoolMatch, PoolMember, UUID } from '../types';
import { formatCurrency, formatDateTime } from '../utils/date';

type AdminPanelProps = {
  pool: Pool;
  members: PoolMember[];
  poolMatches: PoolMatch[];
  onMembersChanged: () => Promise<void>;
  onMatchesChanged: () => Promise<void>;
};

export function AdminPanel({ pool, members, poolMatches, onMembersChanged, onMatchesChanged }: AdminPanelProps) {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [syncingMatches, setSyncingMatches] = useState(false);
  const [workingId, setWorkingId] = useState<UUID | null>(null);
  const [temporarilyRemovedUserIds, setTemporarilyRemovedUserIds] = useState<Set<UUID>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMatches() {
      try {
        setLoadingMatches(true);
        const availableMatches = await listAvailableMatches();
        if (active) {
          setMatches(availableMatches);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Erro ao buscar jogos.');
        }
      } finally {
        if (active) {
          setLoadingMatches(false);
        }
      }
    }

    void loadMatches();

    return () => {
      active = false;
    };
  }, []);

  async function runAction(id: UUID, action: () => Promise<string | void>, successMessage: string) {
    try {
      setWorkingId(id);
      setError(null);
      setMessage(null);
      const actionMessage = await action();
      setMessage(actionMessage ?? successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Erro ao executar ação.');
    } finally {
      setWorkingId(null);
    }
  }

  async function handleConfirmPayment(member: PoolMember) {
    await runAction(
      member.user_id,
      async () => {
        await confirmMemberPayment(pool.id, member.user_id, pool.ticket_value);
        await Promise.all([onMembersChanged(), onMatchesChanged()]);
      },
      'Pagamento confirmado.',
    );
  }

  async function handleUndoPayment(member: PoolMember) {
    await runAction(
      member.user_id,
      async () => {
        await undoMemberPayment(pool.id, member.user_id);
        await Promise.all([onMembersChanged(), onMatchesChanged()]);
      },
      'Pagamento desfeito.',
    );
  }

  async function handleRemoveMember(member: PoolMember) {
    if (member.user_id === user?.id) {
      setError('Você não pode se remover do próprio bolão.');
      return;
    }

    const confirmed = window.confirm(`Remover ${member.display_name} do bolão?`);
    if (!confirmed) {
      return;
    }

    await runAction(
      member.user_id,
      async () => {
        await removePoolMember(pool.id, member.user_id);
        setTemporarilyRemovedUserIds((currentIds) => new Set(currentIds).add(member.user_id));
        await onMatchesChanged();
      },
      'Participante removido.',
    );
  }

  async function handleRestoreMember(member: PoolMember) {
    await runAction(
      member.user_id,
      async () => {
        await restorePoolMember(pool.id, member.user_id);
        setTemporarilyRemovedUserIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(member.user_id);
          return nextIds;
        });
        await Promise.all([onMembersChanged(), onMatchesChanged()]);
      },
      'Remoção desfeita.',
    );
  }

  async function handleAddMatch(match: Match) {
    await runAction(
      match.id,
      async () => {
        await addMatchToPool(pool.id, match.id);
        await onMatchesChanged();
      },
      'Jogo adicionado ao bolão.',
    );
  }

  async function handleRemoveMatch(match: PoolMatch) {
    const confirmed = window.confirm(`Remover ${match.home} x ${match.away} deste bolão? Palpites e vencedores desse jogo no bolão também serão removidos.`);
    if (!confirmed) {
      return;
    }

    await runAction(
      match.match_id,
      async () => {
        await removeMatchFromPool(pool.id, match.match_id);
        await onMatchesChanged();
      },
      'Jogo removido do bolão.',
    );
  }

  async function handleCheckResult(match: PoolMatch) {
    await runAction(
      match.match_id,
      async () => {
        const result = await checkMatchResult(match.match_id);
        await onMatchesChanged();
        return result.message;
      },
      'Conferência finalizada.',
    );
  }

  async function handleSyncMatches() {
    try {
      setSyncingMatches(true);
      setError(null);
      setMessage(null);
      const { total, matches: syncedMatches } = await syncMatchesFromApi();
      const availableMatches = await listAvailableMatches();
      setMatches(availableMatches.length > 0 ? availableMatches : syncedMatches);
      setMessage(`${total} jogos do Brasil importados. Agora escolha quais entram neste bolão.`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Erro ao sincronizar jogos.');
    } finally {
      setSyncingMatches(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h3>Participantes</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Status</th>
                <th>Pago</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isTemporarilyRemoved = temporarilyRemovedUserIds.has(member.user_id);
                const isCurrentUser = member.user_id === user?.id;
                const visibleStatus = isTemporarilyRemoved ? 'REMOVIDO' : member.status;

                return (
                  <tr key={member.user_id} className={isTemporarilyRemoved ? 'removed-row' : undefined}>
                    <td>
                      {member.display_name} {isCurrentUser ? <span className="muted">(você)</span> : null}
                    </td>
                    <td>{visibleStatus}</td>
                    <td>{formatCurrency(isTemporarilyRemoved ? 0 : (member.paid_value ?? 0))}</td>
                    <td className="actions">
                      {isTemporarilyRemoved ? (
                        <button
                          type="button"
                          className="button small secondary"
                          disabled={workingId === member.user_id}
                          onClick={() => void handleRestoreMember(member)}
                        >
                          Desfazer remoção
                        </button>
                      ) : (
                        <>
                          {member.status === 'PAGO' ? (
                            <button
                              type="button"
                              className="button small ghost"
                              disabled={workingId === member.user_id}
                              onClick={() => void handleUndoPayment(member)}
                            >
                              Desfazer pagamento
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="button small"
                              disabled={workingId === member.user_id}
                              onClick={() => void handleConfirmPayment(member)}
                            >
                              Confirmar pagamento
                            </button>
                          )}
                          <button
                            type="button"
                            className="button small danger"
                            disabled={workingId === member.user_id || isCurrentUser}
                            onClick={() => void handleRemoveMember(member)}
                          >
                            {isCurrentUser ? 'Não removível' : 'Remover'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h3>Adicionar jogos</h3>
            <p className="muted">Importe os jogos do Brasil na Copa e adicione ao bolão antes do início.</p>
          </div>
          <button type="button" className="button small secondary" disabled={syncingMatches} onClick={() => void handleSyncMatches()}>
            {syncingMatches ? 'Importando...' : 'Importar jogos do Brasil'}
          </button>
        </div>
        {loadingMatches ? <p>Carregando jogos...</p> : null}
        {!loadingMatches && matches.length === 0 ? (
          <div className="empty-state">Nenhum jogo salvo ainda. Importe os jogos pela TheSportsDB primeiro.</div>
        ) : null}
        <div className="available-matches">
          {matches.map((match) => (
            <div key={match.id} className="available-match">
              <div>
                <strong>
                  {match.home} x {match.away}
                </strong>
                <p className="muted">
                  {match.championship} · {match.phase} · {formatDateTime(match.start_date)}
                </p>
              </div>
              <button
                type="button"
                className="button small"
                disabled={workingId === match.id}
                onClick={() => void handleAddMatch(match)}
              >
                Adicionar
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Jogos do bolão</h3>
        {poolMatches.length === 0 ? <div className="empty-state">Nenhum jogo vinculado a este bolão.</div> : null}
        <div className="available-matches">
          {poolMatches.map((match) => (
            <div key={match.match_id} className="available-match">
              <div>
                <strong>
                  {match.home} x {match.away}
                </strong>
                <p className="muted">
                  {match.championship} · {match.phase} · {formatDateTime(match.start_date)}
                </p>
              </div>
              <button
                type="button"
                className="button small danger"
                disabled={workingId === match.match_id}
                onClick={() => void handleRemoveMatch(match)}
              >
                Remover
              </button>
              <button
                type="button"
                className="button small secondary"
                disabled={workingId === match.match_id}
                onClick={() => void handleCheckResult(match)}
              >
                Conferir resultado
              </button>
            </div>
          ))}
        </div>
      </section>

      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
