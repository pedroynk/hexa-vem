import { supabase } from '../lib/supabase';
import type { Pool, PoolMember, RpcIdResponse, UUID } from '../types';
import { mapRawPoolMember } from './members.service';
import { extractId } from './rpc-response';

export type PoolSummary = Pool & {
  role?: PoolMember['role'];
  member_status?: PoolMember['status'];
};

type RawPoolMemberRow = Record<string, unknown>;
type RawPoolRow = Record<string, unknown>;

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

function normalizePool(row: RawPoolRow): Pool {
  const id = getString(row, ['id']);
  const statusValue = row.status;

  return {
    id,
    name: getString(row, ['name'], `Bolão ${id.slice(0, 8)}`),
    code: getString(row, ['code'], '-'),
    created_by: getString(row, ['created_by']) || undefined,
    ticket_value: getNumber(row, ['ticket_value']),
    current_accumulated: getNumber(row, ['current_accumulated']),
    status: typeof statusValue === 'boolean' ? (statusValue ? 'ATIVO' : 'INATIVO') : getString(row, ['status'], 'ATIVO'),
    created_at: getString(row, ['created_at']) || undefined,
  };
}

export async function listUserPools(userId: UUID): Promise<PoolSummary[]> {
  const [memberRowsResponse, createdPoolRowsResponse] = await Promise.all([
    supabase.from('pool_members').select('*').eq('user_id', userId).returns<RawPoolMemberRow[]>(),
    supabase.from('pools').select('*').eq('created_by', userId).returns<RawPoolRow[]>(),
  ]);

  const { data: memberRows, error: memberRowsError } = memberRowsResponse;
  const { data: createdPoolRows, error: createdPoolRowsError } = createdPoolRowsResponse;

  if (memberRowsError) {
    throw memberRowsError;
  }

  if (createdPoolRowsError) {
    throw createdPoolRowsError;
  }

  const normalizedMembers = (memberRows ?? []).map(mapRawPoolMember).filter((member) => member.status !== 'REMOVIDO');
  const createdPools = (createdPoolRows ?? []).map(normalizePool);
  const poolIds = [
    ...new Set([...normalizedMembers.map((member) => member.pool_id), ...createdPools.map((pool) => pool.id)].filter(Boolean)),
  ];

  if (poolIds.length === 0) {
    return [];
  }

  const { data: poolRows, error: poolRowsError } = await supabase.from('pools').select('*').in('id', poolIds).returns<RawPoolRow[]>();
  if (poolRowsError) {
    throw poolRowsError;
  }

  const poolsById = new Map<string, Pool>();

  for (const pool of createdPools) {
    poolsById.set(pool.id, pool);
  }

  for (const row of poolRows ?? []) {
    const pool = normalizePool(row);
    poolsById.set(pool.id, pool);
  }

  const summariesById = new Map<string, PoolSummary>();

  for (const member of normalizedMembers) {
    const pool = poolsById.get(member.pool_id);

    summariesById.set(member.pool_id, {
      id: member.pool_id,
      name: pool?.name ?? `Bolão ${member.pool_id.slice(0, 8)}`,
      code: pool?.code ?? '-',
      ticket_value: pool?.ticket_value ?? 0,
      status: pool?.status ?? member.status,
      role: member.role,
      member_status: member.status,
    });
  }

  for (const pool of createdPools) {
    if (!summariesById.has(pool.id)) {
      summariesById.set(pool.id, {
        ...pool,
        role: 'ADMIN',
        member_status: 'PAGO',
      });
    }
  }

  return [...summariesById.values()];
}

export async function getPool(poolId: UUID): Promise<Pool> {
  const { data, error } = await supabase.from('pools').select('*').eq('id', poolId).maybeSingle<RawPoolRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      id: poolId,
      name: `Bolão ${poolId.slice(0, 8)}`,
      code: '-',
      ticket_value: 0,
      status: 'ATIVO',
    };
  }

  return normalizePool(data);
}

export async function createPool(name: string, ticketValue: number): Promise<UUID> {
  const { data, error } = await supabase
    .rpc('create_pool', {
      p_name: name,
      p_ticket_value: ticketValue,
    })
    .returns<RpcIdResponse>();

  if (error) {
    throw error;
  }

  const poolId = extractId(data, ['pool_id', 'id']);
  if (!poolId) {
    throw new Error('A RPC create_pool não retornou o id do bolão.');
  }

  return poolId;
}

export async function joinPoolByCode(code: string): Promise<UUID> {
  const { data, error } = await supabase
    .rpc('join_pool_by_code', {
      p_code: code.trim().toUpperCase(),
    })
    .returns<RpcIdResponse>();

  if (error) {
    throw error;
  }

  const poolId = extractId(data, ['pool_id', 'id']);
  if (!poolId) {
    throw new Error('A RPC join_pool_by_code não retornou o id do bolão.');
  }

  return poolId;
}

export async function deletePool(poolId: UUID): Promise<void> {
  const { error } = await supabase.rpc('delete_pool', {
    p_pool_id: poolId,
  });

  if (error) {
    throw error;
  }
}
