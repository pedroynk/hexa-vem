import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { addMatchToPool, checkMatchResult, listAvailableMatches, removeMatchFromPool, syncMatchesFromApi } from '../services/matches.service';
import { confirmMatchEntryPayment, listPoolMatchEntries, undoMatchEntryPayment } from '../services/match-entries.service';
import { removePoolMember, restorePoolMember } from '../services/members.service';
import type { Match, Pool, PoolMatch, PoolMatchEntry, PoolMember, UUID } from '../types';
import { formatCurrency, formatDateTime } from '../utils/date';

type AdminPanelProps = {
  pool: Pool;
  members: PoolMember[];
  poolMatches: PoolMatch[];
  onMembersChanged: () => Promise<void>;
  onMatchesChanged: () => Promise<void>;
  onGuessesChanged: () => Promise<void>;
  onWinnersChanged: () => Promise<void>;
};

function getActionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    return JSON.stringify(error);
  }

  return 'Erro ao executar ação.';
}

export function AdminPanel({ pool, members, poolMatches, onMembersChanged, onMatchesChanged, onGuessesChanged, onWinnersChanged }: AdminPanelProps) {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchEntries, setMatchEntries] = useState<PoolMatchEntry[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [syncingMatches, setSyncingMatches] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
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

  async function refreshMatchEntries() {
    setMatchEntries(await listPoolMatchEntries(pool.id));
  }

  useEffect(() => {
    let active = true;

    async function loadMatchEntries() {
      try {
        const entries = await listPoolMatchEntries(pool.id);
        if (active) {
          setMatchEntries(entries);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Erro ao buscar pagamentos por jogo.');
        }
      }
    }

    void loadMatchEntries();

    return () => {
      active = false;
    };
  }, [pool.id, poolMatches.length, members.length]);

  async function runAction(id: string, action: () => Promise<string | void>, successMessage: string) {
    try {
      setWorkingId(id);
      setError(null);
      setMessage(null);
      const actionMessage = await action();
      setMessage(actionMessage ?? successMessage);
    } catch (actionError) {
      setError(getActionErrorMessage(actionError));
    } finally {
      setWorkingId(null);
    }
  }

  function getMatchEntry(matchId: UUID, userId: UUID): PoolMatchEntry | undefined {
    return matchEntries.find((entry) => entry.match_id === matchId && entry.user_id === userId);
  }

  async function handleConfirmEntryPayment(match: PoolMatch, member: PoolMember) {
    await runAction(
      `${match.match_id}-${member.user_id}`,
      async () => {
        await confirmMatchEntryPayment(pool.id, match.match_id, member.user_id, pool.ticket_value);
        await Promise.all([refreshMatchEntries(), onMatchesChanged()]);
      },
      'Entrada do jogo confirmada.',
    );
  }

  async function handleUndoEntryPayment(match: PoolMatch, member: PoolMember) {
    await runAction(
      `${match.match_id}-${member.user_id}`,
      async () => {
        await undoMatchEntryPayment(pool.id, match.match_id, member.user_id);
        await Promise.all([refreshMatchEntries(), onMatchesChanged()]);
      },
      'Entrada do jogo desfeita.',
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
        await Promise.all([refreshMatchEntries(), onMembersChanged(), onMatchesChanged(), onGuessesChanged(), onWinnersChanged()]);
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
        await Promise.all([refreshMatchEntries(), onMembersChanged(), onMatchesChanged(), onGuessesChanged(), onWinnersChanged()]);
      },
      'Remoção desfeita.',
    );
  }

  async function handleAddMatch(match: Match) {
    await runAction(
      match.id,
      async () => {
        await addMatchToPool(pool.id, match.id);
        await Promise.all([refreshMatchEntries(), onMatchesChanged()]);
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
        await Promise.all([refreshMatchEntries(), onMatchesChanged()]);
      },
      'Jogo removido do bolão.',
    );
  }

  async function handleCheckResult(match: PoolMatch) {
    await runAction(
      match.match_id,
      async () => {
        const result = await checkMatchResult(match.match_id);
        await Promise.all([onMatchesChanged(), onWinnersChanged()]);
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
          {poolMatches.map((match) => {
            const activeMembers = members.filter((member) => member.status !== 'REMOVIDO' && !temporarilyRemovedUserIds.has(member.user_id));
            const matchPrizeValue = matchEntries
              .filter((entry) => entry.match_id === match.match_id && entry.status === 'PAGO')
              .reduce((total, entry) => total + entry.paid_value, 0);

            return (
              <div key={match.match_id} className="available-match match-payment-card">
                <div>
                  <strong>
                    {match.home} x {match.away}
                  </strong>
                  <p className="muted">
                    {match.championship} · {match.phase} · {formatDateTime(match.start_date)}
                  </p>
                  <p className="muted">Em disputa: {formatCurrency(matchPrizeValue)}</p>
                </div>
                <div className="actions">
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

                <div className="match-entry-list">
                  {activeMembers.map((member) => {
                    const entry = getMatchEntry(match.match_id, member.user_id);
                    const entryStatus = entry?.status ?? 'PENDENTE';
                    const entryWorkingId = `${match.match_id}-${member.user_id}`;
                    const visibleEntryValue = entryStatus === 'PAGO' ? (entry?.paid_value ?? pool.ticket_value) : pool.ticket_value;

                    return (
                      <div key={entryWorkingId} className="match-entry-row">
                        <span>{member.display_name}</span>
                        <span className={`pill pill-${entryStatus.toLowerCase()}`}>{entryStatus}</span>
                        <strong>{formatCurrency(visibleEntryValue)}</strong>
                        {entryStatus === 'PAGO' ? (
                          <button
                            type="button"
                            className="button small ghost"
                            disabled={workingId === entryWorkingId}
                            onClick={() => void handleUndoEntryPayment(match, member)}
                          >
                            Desfazer
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button small"
                            disabled={workingId === entryWorkingId}
                            onClick={() => void handleConfirmEntryPayment(match, member)}
                          >
                            Confirmar entrada
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
