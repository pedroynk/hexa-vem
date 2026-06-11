import type { HeadToHeadMatch } from '../types';

type HeadToHeadResponse = {
  matches?: HeadToHeadMatch[];
  error?: string;
};

export async function listHeadToHeadMatches(home: string, away: string): Promise<HeadToHeadMatch[]> {
  const searchParams = new URLSearchParams({
    home,
    away,
  });
  const response = await fetch(`/api/head-to-head?${searchParams.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as HeadToHeadResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? 'Erro ao carregar confrontos.');
  }

  return payload.matches ?? [];
}
