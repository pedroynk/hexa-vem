import { supabase } from '../lib/supabase';
import type { Ranking, UUID } from '../types';
import { listPoolMembers } from './members.service';

type RawWinnerRow = Record<string, unknown>;

const rankingCache = new Map<UUID, { expiresAt: number; ranking: Ranking[] }>();

function getString(row: RawWinnerRow, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return fallback;
}

function getNumber(row: RawWinnerRow, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && value.length > 0) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

async function listRankingFromWinners(poolId: UUID): Promise<Ranking[]> {
  const [{ data, error }, members] = await Promise.all([
    supabase.from('pool_match_winners').select('*').eq('pool_id', poolId).returns<RawWinnerRow[]>(),
    listPoolMembers(poolId),
  ]);

  if (error) {
    throw error;
  }

  const membersById = new Map(members.map((member) => [member.user_id, member]));
  const totalsByUserId = new Map<UUID, Ranking>();

  for (const winner of data ?? []) {
    const userId = getString(winner, ['user_id', 'winner_user_id', 'member_id']);
    if (!userId) continue;

    const member = membersById.get(userId);
    const current = totalsByUserId.get(userId) ?? {
      pool_id: poolId,
      user_id: userId,
      display_name: member?.display_name ?? `Usuário ${userId.slice(0, 8)}`,
      avatar_url: member?.avatar_url ?? null,
      total_wins: 0,
      total_gain: 0,
    };

    current.total_wins += 1;
    current.total_gain += getNumber(winner, ['gain_value', 'prize_value', 'total_gain', 'value', 'amount']);
    totalsByUserId.set(userId, current);
  }

  return [...totalsByUserId.values()].sort((a, b) => b.total_wins - a.total_wins || b.total_gain - a.total_gain);
}

export async function listPoolRanking(poolId: UUID): Promise<Ranking[]> {
  const cached = rankingCache.get(poolId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ranking;
  }

  try {
    const ranking = await listRankingFromWinners(poolId);
    rankingCache.set(poolId, {
      expiresAt: Date.now() + 30_000,
      ranking,
    });

    return ranking;
  } catch {
    return [];
  }
}
