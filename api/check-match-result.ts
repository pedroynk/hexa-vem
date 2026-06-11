/// <reference types="node" />

import { createClient } from '@supabase/supabase-js';
import type { Json, MatchStatus, UUID } from '../src/types.js';

type ApiRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: Json) => void;
  setHeader: (name: string, value: string) => void;
};

type DbMatch = {
  id: UUID;
  external_api: string | null;
  external_match_id: string | null;
};

type TheSportsDbEvent = {
  idEvent: string;
  strEvent?: string | null;
  strLeague?: string | null;
  strSeason?: string | null;
  strRound?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strTimestamp?: string | null;
  strStatus?: string | null;
  strProgress?: string | null;
};

type TheSportsDbLookupResponse = {
  events?: TheSportsDbEvent[] | null;
};

const THE_SPORTS_DB_BASE_URL = 'https://www.thesportsdb.com/api/v1/json';
const FINAL_STATUSES: MatchStatus[] = ['ENCERRADO', 'CANCELADO'];

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getServerSupabaseKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapTheSportsDbStatusToMatchStatus(event: TheSportsDbEvent): MatchStatus {
  const status = (event.strStatus ?? '').toLowerCase();
  const hasFinalScore = event.intHomeScore !== null && event.intHomeScore !== undefined && event.intAwayScore !== null && event.intAwayScore !== undefined;

  if (status.includes('match finished') || status.includes('finished') || status.includes('ft')) {
    return 'ENCERRADO';
  }

  if (status.includes('postponed') || status.includes('cancelled') || status.includes('canceled')) {
    return 'CANCELADO';
  }

  if (status.includes('live') || status.includes('in play') || status.includes('1h') || status.includes('2h') || (event.strProgress && event.strProgress !== '0')) {
    return 'EM_ANDAMENTO';
  }

  if (hasFinalScore) {
    return 'ENCERRADO';
  }

  return 'AGENDADO';
}

function getStartDate(event: TheSportsDbEvent): string {
  if (event.strTimestamp) return new Date(event.strTimestamp).toISOString();

  const date = event.dateEvent ?? new Date().toISOString().slice(0, 10);
  const rawTime = event.strTime?.trim() ?? '00:00:00';
  const time = /(?:z|[+-]\d{2}:?\d{2})$/i.test(rawTime) ? rawTime : `${rawTime}Z`;
  const parsedDate = new Date(`${date}T${time}`);

  return Number.isNaN(parsedDate.getTime()) ? `${date}T${rawTime}` : parsedDate.toISOString();
}

async function parseJsonResponse<T>(apiResponse: Response, sourceName: string): Promise<T> {
  const body = await apiResponse.text();

  if (!body.trim()) {
    throw new Error(`${sourceName} retornou uma resposta vazia.`);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${sourceName} retornou uma resposta inválida. Confira a chave e os parâmetros da API.`);
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (request.method === 'OPTIONS') {
    response.status(204).json(null);
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const matchId = firstQueryValue(request.query?.matchId);
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = getServerSupabaseKey();
  const theSportsDbKey = process.env.THE_SPORTS_DB_KEY;

  if (!matchId) {
    response.status(400).json({ error: 'matchId é obrigatório.' });
    return;
  }

  if (!supabaseUrl || !supabaseKey || !theSportsDbKey) {
    response.status(500).json({
      error: 'Variáveis VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e THE_SPORTS_DB_KEY são obrigatórias no servidor.',
    });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id,external_api,external_match_id')
    .eq('id', matchId)
    .maybeSingle<DbMatch>();

  if (matchError) {
    response.status(500).json({ error: matchError.message });
    return;
  }

  if (!match?.external_match_id || match.external_api !== 'thesportsdb') {
    response.status(400).json({
      error: 'Este jogo precisa ter sido sincronizado pela TheSportsDB para conferir resultado automaticamente.',
    });
    return;
  }

  let apiResponse: Response;
  try {
    apiResponse = await fetch(`${THE_SPORTS_DB_BASE_URL}/${theSportsDbKey}/lookupevent.php?id=${encodeURIComponent(match.external_match_id)}`);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'Erro de rede ao consultar TheSportsDB.',
    });
    return;
  }

  if (!apiResponse.ok) {
    response.status(apiResponse.status).json({ error: `Erro ao consultar TheSportsDB: HTTP ${apiResponse.status}.` });
    return;
  }

  let payload: TheSportsDbLookupResponse;
  try {
    payload = await parseJsonResponse<TheSportsDbLookupResponse>(apiResponse, 'TheSportsDB');
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'Erro ao interpretar resposta da TheSportsDB.',
    });
    return;
  }

  const event = payload.events?.[0];

  if (!event) {
    response.status(404).json({ error: 'Jogo não encontrado na TheSportsDB.' });
    return;
  }

  const status = mapTheSportsDbStatusToMatchStatus(event);

  if (!FINAL_STATUSES.includes(status)) {
    response.status(200).json({
      final: false,
      status,
      message: `Jogo ainda não encerrado. Status atual: ${event.strStatus ?? 'sem status final'}.`,
    });
    return;
  }

  const { error: upsertError } = await supabase.rpc('upsert_match_from_api', {
    p_external_api: 'thesportsdb',
    p_external_match_id: String(event.idEvent),
    p_championship: event.strLeague ?? 'Seleção Brasileira',
    p_phase: event.strRound ?? event.strSeason ?? 'Calendário',
    p_home: event.strHomeTeam ?? 'Mandante',
    p_away: event.strAwayTeam ?? 'Visitante',
    p_start_date: getStartDate(event),
    p_home_goals: toNumber(event.intHomeScore),
    p_away_goals: toNumber(event.intAwayScore),
    p_game_minute: toNumber(event.strProgress),
    p_period: event.strStatus ?? 'Finished',
    p_status: status,
    p_api_data: event,
  });

  if (upsertError) {
    response.status(500).json({ error: upsertError.message });
    return;
  }

  if (status === 'ENCERRADO') {
    const { error: winnersError } = await supabase.rpc('calculate_all_pools_for_match', {
      p_match_id: match.id,
    });

    if (winnersError) {
      response.status(500).json({ error: winnersError.message });
      return;
    }
  }

  response.status(200).json({
    final: true,
    status,
    message: status === 'ENCERRADO' ? 'Resultado conferido e vencedores calculados.' : 'Jogo cancelado atualizado.',
  });
}
