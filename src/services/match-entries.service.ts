import { supabase } from '../lib/supabase';
import type { MemberStatus, PoolMatchEntry, UUID } from '../types';

type RawMatchEntryRow = Record<string, unknown>;

function getString(row: RawMatchEntryRow, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return fallback;
}

function getNumber(row: RawMatchEntryRow, keys: string[], fallback = 0): number {
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

function normalizeStatus(value: string): MemberStatus {
  const normalized = value.toUpperCase();

  if (normalized === 'PAGO' || normalized === 'PAID') {
    return 'PAGO';
  }

  if (normalized === 'REMOVIDO' || normalized === 'REMOVED') {
    return 'REMOVIDO';
  }

  return 'PENDENTE';
}

function mapRawMatchEntry(row: RawMatchEntryRow): PoolMatchEntry {
  const userId = getString(row, ['user_id', 'member_id']);

  return {
    pool_id: getString(row, ['pool_id']),
    match_id: getString(row, ['match_id']),
    user_id: userId,
    display_name: getString(row, ['display_name', 'full_name', 'name', 'email'], `Usuario ${userId.slice(0, 8)}`),
    avatar_url: getString(row, ['avatar_url', 'picture']) || null,
    status: normalizeStatus(getString(row, ['status', 'entry_status', 'payment_status'])),
    paid_value: getNumber(row, ['paid_value', 'paid_amount', 'amount_paid']),
    paid_at: getString(row, ['paid_at', 'paid_date', 'payment_confirmed_at']) || null,
  };
}

function throwSupabaseError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const message = [record.message, record.details, record.hint, record.code].filter(Boolean).join(' | ');
    throw new Error(message || JSON.stringify(record));
  }

  throw new Error(String(error));
}

export async function listPoolMatchEntries(poolId: UUID): Promise<PoolMatchEntry[]> {
  const { data, error } = await supabase
    .from('v_pool_match_entries')
    .select('*')
    .eq('pool_id', poolId)
    .returns<RawMatchEntryRow[]>();

  if (error) {
    throwSupabaseError(error);
  }

  return (data ?? []).map(mapRawMatchEntry);
}

export async function confirmMatchEntryPayment(poolId: UUID, matchId: UUID, userId: UUID, paidValue: number): Promise<void> {
  const { error } = await supabase.rpc('confirm_match_entry_payment', {
    p_pool_id: poolId,
    p_match_id: matchId,
    p_user_id: userId,
    p_paid_value: paidValue,
  });

  if (error) {
    throwSupabaseError(error);
  }
}

export async function undoMatchEntryPayment(poolId: UUID, matchId: UUID, userId: UUID): Promise<void> {
  const { error } = await supabase.rpc('remove_match_entry_payment', {
    p_pool_id: poolId,
    p_match_id: matchId,
    p_user_id: userId,
  });

  if (error) {
    throwSupabaseError(error);
  }
}
