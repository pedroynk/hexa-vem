import { useEffect, useState } from 'react';
import { getPoolMember } from '../services/members.service';
import type { PoolMember, PoolRole, UUID } from '../types';
import { useAuth } from './useAuth';

type PoolRoleState = {
  role: PoolRole | null;
  currentMember: PoolMember | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
};

export function usePoolRole(poolId: UUID | undefined): PoolRoleState {
  const { user } = useAuth();
  const [state, setState] = useState<PoolRoleState>({
    role: null,
    currentMember: null,
    isAdmin: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!poolId || !user) {
      return;
    }

    const currentPoolId = poolId;
    const currentUserId = user.id;
    let active = true;

    async function loadRole() {
      try {
        setState((previous) => ({ ...previous, loading: true, error: null }));
        const currentMember = await getPoolMember(currentPoolId, currentUserId);
        const role = currentMember?.role ?? null;

        if (active) {
          setState({
            role,
            currentMember,
            isAdmin: role === 'ADMIN',
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        if (active) {
          setState({
            role: null,
            currentMember: null,
            isAdmin: false,
            loading: false,
            error: error instanceof Error ? error.message : 'Erro ao carregar permissões.',
          });
        }
      }
    }

    void loadRole();

    return () => {
      active = false;
    };
  }, [poolId, user]);

  if (!poolId || !user) {
    return {
      role: null,
      currentMember: null,
      isAdmin: false,
      loading: false,
      error: null,
    };
  }

  return state;
}
