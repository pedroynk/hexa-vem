import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AdminPanel } from '../components/AdminPanel';
import { Layout } from '../components/Layout';
import { MatchCard } from '../components/MatchCard';
import { MembersTable } from '../components/MembersTable';
import { RankingTable } from '../components/RankingTable';
import { useAuth } from '../hooks/useAuth';
import { listPoolGuesses, upsertGuess } from '../services/guesses.service';
import { listPoolMatches } from '../services/matches.service';
import { listPoolMembers } from '../services/members.service';
import { getPool } from '../services/pools.service';
import { listPoolRanking } from '../services/ranking.service';
import { getSupabaseErrorMessage } from '../services/supabase-error';
import type { Guess, Pool, PoolMatch, PoolMember, Ranking } from '../types';
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
  const livePrizeValue = useMemo(() => {
    const paidTotal = members
      .filter((member) => member.status === 'PAGO')
      .reduce((total, member) => total + (member.paid_value > 0 ? member.paid_value : (pool?.ticket_value ?? 0)), 0);

    return paidTotal + (pool?.current_accumulated ?? 0);
  }, [members, pool?.current_accumulated, pool?.ticket_value]);
  const matchesWithPrize = useMemo(
    () =>
      matches.map((match) => ({
        ...match,
        prize_value: match.prize_value && match.prize_value > 0 ? match.prize_value : livePrizeValue,
      })),
    [livePrizeValue, matches],
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
        const [poolResult, matchesResult, membersResult, guessesResult] = await Promise.allSettled([
          getPool(currentPoolId),
          listPoolMatches(currentPoolId),
          listPoolMembers(currentPoolId),
          listPoolGuesses(currentPoolId, currentUserId),
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
          setPool(poolResult.value);
          setMatches(matchesResult.value);
          setMembers(membersResult.status === 'fulfilled' ? membersResult.value : []);
          setGuesses(guessesResult.status === 'fulfilled' ? guessesResult.value : []);

          const optionalErrors = [membersResult, guessesResult]
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
    await refreshGuesses();
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
          <p className="muted">Entrada: {formatCurrency(pool.ticket_value)}</p>
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
              participantsCount={members.length}
              onSaveGuess={handleSaveGuess}
            />
          ))}
        </div>
      ) : null}

      {visibleActiveTab === 'members' ? <MembersTable members={members} matches={matchesWithPrize} guesses={guesses} /> : null}
      {visibleActiveTab === 'ranking' ? (
        rankingLoading ? <div className="center-card">Carregando ranking...</div> : <RankingTable ranking={ranking} />
      ) : null}
      {visibleActiveTab === 'admin' && isAdmin ? (
        <AdminPanel
          pool={pool}
          members={members}
          poolMatches={matchesWithPrize}
          onMembersChanged={refreshMembers}
          onMatchesChanged={refreshMatches}
        />
      ) : null}
    </Layout>
  );
}
