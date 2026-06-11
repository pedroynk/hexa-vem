import { supabase } from '../lib/supabase';
import type { Match, MatchStatus, PoolMatch, UUID } from '../types';

type RawPoolMatchRow = Record<string, unknown>;

function getString(row: RawPoolMatchRow, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return fallback;
}

function getNumber(row: RawPoolMatchRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number') {
      return value;
    }
  }

  return null;
}

function normalizeMatchStatus(value: string): MatchStatus {
  if (value === 'EM_ANDAMENTO' || value === 'ENCERRADO' || value === 'CANCELADO') {
    return value;
  }

  return 'AGENDADO';
}

function mapRawPoolMatch(row: RawPoolMatchRow): PoolMatch {
  const matchId = getString(row, ['match_id', 'id']);

  return {
    id: matchId,
    pool_id: getString(row, ['pool_id']),
    match_id: matchId,
    championship: getString(row, ['championship'], 'Copa do Mundo 2026'),
    phase: getString(row, ['phase'], '-'),
    home: getString(row, ['home']),
    away: getString(row, ['away']),
    start_date: getString(row, ['start_date']),
    home_goals: getNumber(row, ['home_goals']),
    away_goals: getNumber(row, ['away_goals']),
    game_minute: getNumber(row, ['game_minute']),
    period: getString(row, ['period']) || null,
    status: normalizeMatchStatus(getString(row, ['status', 'match_status'])),
    pool_status: getString(row, ['pool_status', 'pool_match_status']),
    prize_value: getNumber(row, ['prize_value', 'total_value_in_game']),
  };
}

export async function listPoolMatches(poolId: UUID): Promise<PoolMatch[]> {
  const { data, error } = await supabase
    .from('v_pool_matches')
    .select('*')
    .eq('pool_id', poolId)
    .order('start_date', { ascending: true })
    .returns<RawPoolMatchRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRawPoolMatch);
}

export async function listAvailableMatches(): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('start_date', { ascending: true })
    .returns<Match[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function addMatchToPool(poolId: UUID, matchId: UUID): Promise<void> {
  const { error } = await supabase.rpc('add_match_to_pool', {
    p_pool_id: poolId,
    p_match_id: matchId,
  });

  if (error) {
    throw error;
  }
}

export async function removeMatchFromPool(poolId: UUID, matchId: UUID): Promise<void> {
  const { error } = await supabase.rpc('remove_match_from_pool', {
    p_pool_id: poolId,
    p_match_id: matchId,
  });

  if (error) {
    throw error;
  }
}

type SyncMatchesResponse = {
  total?: number;
  synced?: Array<Partial<Match> & { match_id?: string | null }>;
  error?: string;
};

export type SyncMatchesOptions = {
  team?: string;
  league?: string;
  season?: string;
};

export async function syncMatchesFromApi(options: SyncMatchesOptions = {}): Promise<{ total: number; matches: Match[] }> {
  const searchParams = new URLSearchParams();

  if (options.team) searchParams.set('team', options.team);
  if (options.league !== undefined) searchParams.set('league', options.league);
  if (options.season) searchParams.set('season', options.season);

  const queryString = searchParams.toString();
  const response = await fetch(`/api/sync-matches${queryString ? `?${queryString}` : ''}`, {
    method: 'POST',
  });

  const payload = (await response.json().catch(() => ({}))) as SyncMatchesResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? 'Erro ao sincronizar jogos pela TheSportsDB.');
  }

  return {
    total: payload.total ?? 0,
    matches: (payload.synced ?? [])
      .filter((match): match is Match => Boolean(match.id && match.home && match.away && match.start_date))
      .map((match) => ({
        id: match.id,
        external_api: match.external_api ?? 'thesportsdb',
        external_match_id: match.external_match_id ?? null,
        championship: match.championship ?? 'Copa do Mundo',
        phase: match.phase ?? 'Brasil',
        home: match.home,
        away: match.away,
        start_date: match.start_date,
        home_goals: match.home_goals ?? null,
        away_goals: match.away_goals ?? null,
        game_minute: match.game_minute ?? null,
        period: match.period ?? null,
        status: match.status ?? 'AGENDADO',
      })),
  };
}

type CheckMatchResultResponse = {
  final?: boolean;
  status?: MatchStatus;
  message?: string;
  error?: string;
};

export async function checkMatchResult(matchId: UUID): Promise<CheckMatchResultResponse> {
  const response = await fetch(`/api/check-match-result?matchId=${encodeURIComponent(matchId)}`, {
    method: 'POST',
  });
  const payload = (await response.json().catch(() => ({}))) as CheckMatchResultResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? 'Erro ao conferir resultado do jogo.');
  }

  return payload;
}
