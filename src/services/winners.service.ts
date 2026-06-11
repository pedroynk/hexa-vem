import { supabase } from '../lib/supabase';
import type { PoolMatchWinner, PoolMember, UUID } from '../types';

type RawWinnerRow = Record<string, unknown>;

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

export async function listPoolMatchWinners(poolId: UUID, members: PoolMember[] = []): Promise<PoolMatchWinner[]> {
  const { data, error } = await supabase.from('pool_match_winners').select('*').eq('pool_id', poolId).returns<RawWinnerRow[]>();

  if (error) {
    throw error;
  }

  const membersById = new Map(members.map((member) => [member.user_id, member]));

  return (data ?? []).map((winner) => {
    const userId = getString(winner, ['user_id', 'winner_user_id', 'member_id']);
    const member = membersById.get(userId);

    return {
      pool_id: getString(winner, ['pool_id'], poolId),
      match_id: getString(winner, ['match_id']),
      user_id: userId,
      display_name: member?.display_name ?? `Usuario ${userId.slice(0, 8)}`,
      avatar_url: member?.avatar_url ?? null,
      gain_value: getNumber(winner, ['gain_value', 'prize_value', 'total_gain', 'value', 'amount']),
    };
  });
}
