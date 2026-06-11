import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AdminPanel } from '../components/AdminPanel';
import { Layout } from '../components/Layout';
import { MatchCard } from '../components/MatchCard';
import { MembersTable } from '../components/MembersTable';
import { RankingTable } from '../components/RankingTable';
import { useAuth } from '../hooks/useAuth';
import { listPoolGuesses, upsertGuess } from '../services/guesses.service';
import { listPoolMatchEntries } from '../services/match-entries.service';
import { listPoolMatches } from '../services/matches.service';
import { listPoolMembers } from '../services/members.service';
import { getPool } from '../services/pools.service';
import { listPoolRanking } from '../services/ranking.service';
import { getSupabaseErrorMessage } from '../services/supabase-error';
import { listPoolMatchWinners } from '../services/winners.service';
import type { Guess, Pool, PoolMatch, PoolMatchEntry, PoolMatchGuess, PoolMatchWinner, PoolMember, Ranking } from '../types';
import { formatCurrency } from '../utils/date';

type TabId = 'matches' | 'members' | 'ranking' | 'admin';

const baseTabs: Array<{ id: TabId; label: string }> = [
  { id: 'matches', label: 'Jogos' },
  { id: 'members', label: 'Participantes' },
  { id: 'ranking', label: 'Ranking' },
];

export function PoolPage() {
  const { poolId } = useParams<{ poolId: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('matches');
  const [pool, setPool] = useState<Pool | null>(null);
  const [matches, setMatches] = useState<PoolMatch[]>([]);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [members, setMembers] = useState<PoolMember[]>([]);
  const [matchEntries, setMatchEntries] = useState<PoolMatchEntry[]>([]);
  const [winners, setWinners] = useState<PoolMatchWinner[]>([]);
  const [ranking, setRanking] = useState<Ranking[]>([]);
  const [rankingLoaded, setRankingLoaded] = useState(false);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const isAdmin = members.some((member) => member.user_id === user?.id && member.role === 'ADMIN' && member.status !== 'REMOVIDO');
  const tabs = useMemo(() => (isAdmin ? [...baseTabs, { id: 'admin' as const, label: 'Admin' }] : baseTabs), [isAdmin]);
  const visibleActiveTab = activeTab === 'admin' && !isAdmin ? 'matches' : activeTab;
  const guessesByMatchId = useMemo(
    () => new Map(guesses.filter((guess) => guess.user_id === user?.id).map((guess) => [guess.match_id, guess])),
    [guesses, user?.id],
  );
  const guessesCountByMatchId = useMemo(() => {
    const counts = new Map<string, number>();

    for (const guess of guesses) {
      counts.set(guess.match_id, (counts.get(guess.match_id) ?? 0) + 1);
    }

    return counts;
  }, [guesses]);
  const guessDetailsByMatchId = useMemo(() => {
    const membersById = new Map(members.map((member) => [member.user_id, member]));
    const groupedGuesses = new Map<string, PoolMatchGuess[]>();

    for (const currentGuess of guesses) {
      const member = membersById.get(currentGuess.user_id);
      const matchGuesses = groupedGuesses.get(currentGuess.match_id) ?? [];

      matchGuesses.push({
        user_id: currentGuess.user_id,
        display_name: member?.display_name ?? `Usuario ${currentGuess.user_id.slice(0, 8)}`,
        avatar_url: member?.avatar_url ?? null,
        home_goals: currentGuess.home_goals,
        away_goals: currentGuess.away_goals,
      });
      groupedGuesses.set(currentGuess.match_id, matchGuesses);
    }

    return groupedGuesses;
  }, [guesses, members]);
  const currentUserEntryByMatchId = useMemo(
    () => new Map(matchEntries.filter((entry) => entry.user_id === user?.id).map((entry) => [entry.match_id, entry])),
    [matchEntries, user?.id],
  );
  const paidTotalByMatchId = useMemo(() => {
    const totals = new Map<string, number>();

    for (const entry of matchEntries) {
      if (entry.status !== 'PAGO') {
        continue;
      }

      totals.set(entry.match_id, (totals.get(entry.match_id) ?? 0) + entry.paid_value);
    }

    return totals;
  }, [matchEntries]);
  const winnersByMatchId = useMemo(() => {
    const groupedWinners = new Map<string, PoolMatchWinner[]>();

    for (const winner of winners) {
      const matchWinners = groupedWinners.get(winner.match_id) ?? [];
      matchWinners.push(winner);
      groupedWinners.set(winner.match_id, matchWinners);
    }

    return groupedWinners;
  }, [winners]);
  const matchesWithPrize = useMemo(
    () =>
      matches.map((match) => ({
        ...match,
        prize_value: match.prize_value ?? 0,
      })),
    [matches],
  );

  async function refreshMatches() {
    if (!poolId) {
      return;
    }
    setMatches(await listPoolMatches(poolId));
  }

  async function refreshMembers() {
    if (!poolId) {
      return;
    }
    setMembers(await listPoolMembers(poolId));
  }

  async function refreshGuesses() {
    if (!poolId || !user) {
      return;
    }
    setGuesses(await listPoolGuesses(poolId, user.id));
  }

  async function refreshMatchEntries() {
    if (!poolId) {
      return;
    }

    setMatchEntries(await listPoolMatchEntries(poolId));
  }

  async function refreshWinners(nextMembers = members) {
    if (!poolId) {
      return;
    }

    setWinners(await listPoolMatchWinners(poolId, nextMembers));
  }

  useEffect(() => {
    if (!poolId || !user) {
      return;
    }

    const currentPoolId = poolId;
    const currentUserId = user.id;
    let active = true;

    async function loadPool() {
      try {
        setLoading(true);
        setError(null);
        setWarning(null);
        const [poolResult, matchesResult, membersResult, guessesResult, entriesResult] = await Promise.allSettled([
          getPool(currentPoolId),
          listPoolMatches(currentPoolId),
          listPoolMembers(currentPoolId),
          listPoolGuesses(currentPoolId, currentUserId),
          listPoolMatchEntries(currentPoolId),
        ]);

        if (poolResult.status === 'rejected' || matchesResult.status === 'rejected') {
          throw new Error(
            getSupabaseErrorMessage(
              poolResult.status === 'rejected'
                ? poolResult.reason
                : matchesResult.status === 'rejected'
                  ? matchesResult.reason
                  : undefined,
            ),
          );
        }

        if (active) {
          const loadedMembers = membersResult.status === 'fulfilled' ? membersResult.value : [];

          setPool(poolResult.value);
          setMatches(matchesResult.value);
          setMembers(loadedMembers);
          setGuesses(guessesResult.status === 'fulfilled' ? guessesResult.value : []);
          setMatchEntries(entriesResult.status === 'fulfilled' ? entriesResult.value : []);
          setWinners(await listPoolMatchWinners(currentPoolId, loadedMembers));

          const optionalErrors = [membersResult, guessesResult, entriesResult]
            .filter((result) => result.status === 'rejected')
            .map((result) => getSupabaseErrorMessage(result.reason));

          setWarning(optionalErrors.length > 0 ? `Alguns dados não puderam ser carregados: ${optionalErrors.join(' | ')}` : null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar bolão.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPool();

    return () => {
      active = false;
    };
  }, [poolId, user]);

  useEffect(() => {
    if (visibleActiveTab !== 'ranking' || !poolId || rankingLoaded) {
      return;
    }

    const currentPoolId = poolId;
    let active = true;

    async function loadRanking() {
      try {
        setRankingLoading(true);
        const poolRanking = await listPoolRanking(currentPoolId);
        if (active) {
          setRanking(poolRanking);
          setRankingLoaded(true);
        }
      } catch (rankingError) {
        if (active) {
          setWarning(rankingError instanceof Error ? rankingError.message : 'Erro ao carregar ranking.');
        }
      } finally {
        if (active) {
          setRankingLoading(false);
        }
      }
    }

    void loadRanking();

    return () => {
      active = false;
    };
  }, [poolId, rankingLoaded, visibleActiveTab]);

  async function handleSaveGuess(matchId: string, homeGoals: number, awayGoals: number) {
    if (!poolId) {
      return;
    }

    await upsertGuess(poolId, matchId, homeGoals, awayGoals);
    await Promise.all([refreshGuesses(), refreshMatchEntries()]);
  }

  if (!poolId || !user) {
    return (
      <Layout>
        <div className="error-box">Bolão ou usuário não encontrado.</div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="center-card">Carregando bolão...</div>
      </Layout>
    );
  }

  if (error || !pool) {
    return (
      <Layout>
        <div className="error-box">{error ?? 'Bolão não encontrado.'}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <p className="eyebrow">Código {pool.code}</p>
          <h1>{pool.name}</h1>
          <p className="muted">Entrada por jogo: {formatCurrency(pool.ticket_value)}</p>
        </div>
        <span className="pill">{pool.status}</span>
      </div>

      <nav className="tabs" aria-label="Abas do bolão">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={visibleActiveTab === tab.id ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {warning ? <div className="warning-box">{warning}</div> : null}

      {visibleActiveTab === 'matches' ? (
        <div className="stack">
          {matchesWithPrize.length === 0 ? <div className="empty-state">Nenhum jogo vinculado a este bolão.</div> : null}
          {matchesWithPrize.map((match) => (
            <MatchCard
              key={match.match_id ?? match.id}
              match={match}
              guess={guessesByMatchId.get(match.match_id ?? match.id)}
              guessesCount={guessesCountByMatchId.get(match.match_id ?? match.id) ?? 0}
              matchGuesses={guessDetailsByMatchId.get(match.match_id ?? match.id) ?? []}
              participantsCount={members.length}
              currentUserId={user.id}
              userEntry={currentUserEntryByMatchId.get(match.match_id ?? match.id)}
              accumulatedValue={Math.max(0, (match.prize_value ?? 0) - (paidTotalByMatchId.get(match.match_id ?? match.id) ?? 0))}
              winners={winnersByMatchId.get(match.match_id ?? match.id) ?? []}
              onSaveGuess={handleSaveGuess}
            />
          ))}
        </div>
      ) : null}

      {visibleActiveTab === 'members' ? <MembersTable members={members} matches={matchesWithPrize} guesses={guesses} /> : null}
      {visibleActiveTab === 'ranking' ? (
        <>
          {(pool.current_accumulated ?? 0) > 0 ? (
            <div className="warning-box">
              Acumulado aguardando próximo jogo: {formatCurrency(pool.current_accumulated ?? 0)}.
            </div>
          ) : null}
          {rankingLoading ? <div className="center-card">Carregando ranking...</div> : <RankingTable ranking={ranking} />}
        </>
      ) : null}
      {visibleActiveTab === 'admin' && isAdmin ? (
        <AdminPanel
          pool={pool}
          members={members}
          poolMatches={matchesWithPrize}
          onMembersChanged={refreshMembers}
          onMatchesChanged={refreshMatches}
          onEntriesChanged={refreshMatchEntries}
          onGuessesChanged={refreshGuesses}
          onWinnersChanged={refreshWinners}
        />
      ) : null}
    </Layout>
  );
}
