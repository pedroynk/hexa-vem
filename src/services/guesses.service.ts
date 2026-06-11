import { supabase } from '../lib/supabase';
import type { Guess, UUID } from '../types';
import { isForbiddenError } from './supabase-error';

export async function listUserGuesses(poolId: UUID, userId: UUID): Promise<Guess[]> {
  const { data, error } = await supabase
    .from('guesses')
    .select('*')
    .eq('pool_id', poolId)
    .eq('user_id', userId)
    .returns<Guess[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listPoolGuesses(poolId: UUID, fallbackUserId?: UUID): Promise<Guess[]> {
  const { data, error } = await supabase
    .from('guesses')
    .select('*')
    .eq('pool_id', poolId)
    .returns<Guess[]>();

  if (error && fallbackUserId && isForbiddenError(error)) {
    return listUserGuesses(poolId, fallbackUserId);
  }

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function upsertGuess(
  poolId: UUID,
  matchId: UUID,
  homeGoals: number,
  awayGoals: number,
): Promise<void> {
  const { error } = await supabase.rpc('upsert_guess', {
    p_pool_id: poolId,
    p_match_id: matchId,
    p_home_goals: homeGoals,
    p_away_goals: awayGoals,
  });

  if (error) {
    throw error;
  }
}
