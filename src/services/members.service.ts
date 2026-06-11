import { supabase } from '../lib/supabase';
import type { MemberStatus, PoolMember, PoolRole, UUID } from '../types';
import { isMissingRelationError } from './supabase-error';

type RawPoolMemberRow = Record<string, unknown>;

function getString(row: RawPoolMemberRow, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return fallback;
}

function getNumber(row: RawPoolMemberRow, keys: string[], fallback = 0): number {
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

function normalizeRole(value: string): PoolRole {
  return value.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'PARTICIPANTE';
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

export function mapRawPoolMember(row: RawPoolMemberRow): PoolMember {
  const userId = getString(row, ['user_id', 'profile_id', 'member_id']);
  const displayName = getString(row, ['display_name', 'full_name', 'name', 'email'], `Usuário ${userId.slice(0, 8)}`);

  return {
    pool_id: getString(row, ['pool_id']),
    user_id: userId,
    display_name: displayName,
    avatar_url: getString(row, ['avatar_url', 'picture']) || null,
    role: normalizeRole(getString(row, ['role', 'member_role', 'pool_role'])),
    status: normalizeStatus(getString(row, ['status', 'member_status', 'payment_status'])),
    paid_value: getNumber(row, ['paid_value', 'paid_amount', 'amount_paid']),
    paid_at: getString(row, ['paid_at', 'paid_date', 'payment_confirmed_at']) || null,
  };
}

export async function listPoolMembers(poolId: UUID): Promise<PoolMember[]> {
  const { data, error } = await supabase
    .from('v_pool_members')
    .select('*')
    .eq('pool_id', poolId)
    .returns<RawPoolMemberRow[]>();

  if (error) {
    throw new Error(`Não foi possível carregar v_pool_members. Verifique se a view existe e tem GRANT SELECT para authenticated. Detalhe: ${error.message}`);
  }

  return (data ?? [])
    .map(mapRawPoolMember)
    .filter((member) => member.status !== 'REMOVIDO')
    .sort((a, b) => a.role.localeCompare(b.role));
}

export async function getPoolMember(poolId: UUID, userId: UUID): Promise<PoolMember | null> {
  const { data, error } = await supabase
    .from('pool_members')
    .select('*')
    .eq('pool_id', poolId)
    .eq('user_id', userId)
    .maybeSingle<RawPoolMemberRow>();

  if (error) {
    throw error;
  }

  return data ? mapRawPoolMember(data) : null;
}

export async function confirmMemberPayment(poolId: UUID, userId: UUID, paidValue: number): Promise<void> {
  const { error } = await supabase.rpc('confirm_member_payment', {
    p_pool_id: poolId,
    p_user_id: userId,
    p_paid_value: paidValue,
  });

  if (error) {
    throw error;
  }
}

export async function undoMemberPayment(poolId: UUID, userId: UUID): Promise<void> {
  const { error } = await supabase.rpc('remove_member_payment', {
    p_pool_id: poolId,
    p_user_id: userId,
  });

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('A RPC remove_member_payment ainda não existe no Supabase.');
    }

    throw error;
  }
}

export async function removePoolMember(poolId: UUID, userId: UUID): Promise<void> {
  const { error } = await supabase.rpc('remove_pool_member', {
    p_pool_id: poolId,
    p_user_id: userId,
  });

  if (error) {
    throw error;
  }
}

export async function restorePoolMember(poolId: UUID, userId: UUID): Promise<void> {
  const { error } = await supabase.rpc('restore_pool_member', {
    p_pool_id: poolId,
    p_user_id: userId,
  });

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error('A RPC restore_pool_member ainda não existe no Supabase. Rode o supabase/app-fixes.sql no SQL Editor.');
    }

    throw error;
  }
}
