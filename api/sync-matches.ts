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

type SyncedMatch = {
  id: UUID | null;
  external_api: string;
  external_match_id: string;
  championship: string;
  phase: string;
  home: string;
  away: string;
  start_date: string;
  home_goals: number | null;
  away_goals: number | null;
  game_minute: number | null;
  period: string;
  status: MatchStatus;
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

type TheSportsDbResponse = {
  events?: TheSportsDbEvent[] | null;
  event?: TheSportsDbEvent[] | null;
};

const THE_SPORTS_DB_BASE_URL = 'https://www.thesportsdb.com/api/v1/json';
const DEFAULT_THE_SPORTS_DB_TARGET_TEAM_ID = '134497';
const DEFAULT_THE_SPORTS_DB_TEAM_NAME = 'Mexico';
const DEFAULT_THE_SPORTS_DB_WORLD_CUP_LEAGUE_ID = '4429';
const DEFAULT_THE_SPORTS_DB_WORLD_CUP_SEASON = '2026';
const DEFAULT_THE_SPORTS_DB_TEAM_ALIASES = ['Mexico', 'México'];

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractMatchId(data: unknown): UUID | null {
  if (!data) return null;

  if (typeof data === 'string') return data;

  if (Array.isArray(data)) {
    for (const item of data) {
      const id = extractMatchId(item);
      if (id) return id;
    }
    return null;
  }

  if (isRecord(data)) {
    if (typeof data.match_id === 'string') return data.match_id;
    if (typeof data.id === 'string') return data.id;
  }

  return null;
}

async function fetchJson<T>(url: string, init: RequestInit, sourceName: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : `Erro de rede ao consultar ${sourceName}.`);
  }

  if (!response.ok) {
    throw new Error(`Erro ao consultar ${sourceName}: HTTP ${response.status}.`);
  }

  const body = await response.text();

  if (!body.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${sourceName} retornou uma resposta inválida. Confira a chave e os parâmetros da API.`);
  }
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

function normalizeSearchTerm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getTeamSearchTerms(request: ApiRequest): string[] {
  const queryTeamName = firstQueryValue(request.query?.teamName);
  const teamName = queryTeamName ?? process.env.THE_SPORTS_DB_TEAM_NAME ?? DEFAULT_THE_SPORTS_DB_TEAM_NAME;

  return [...new Set([teamName, ...DEFAULT_THE_SPORTS_DB_TEAM_ALIASES].map(normalizeSearchTerm).filter(Boolean))];
}

function getTheSportsDbUrls(request: ApiRequest, apiKey: string): string[] {
  const query = request.query ?? {};

  const endpoint = firstQueryValue(query.endpoint) ?? 'brazil-world-cup';
  const team = firstQueryValue(query.team) ?? process.env.THE_SPORTS_DB_TEAM_ID ?? DEFAULT_THE_SPORTS_DB_TARGET_TEAM_ID;
  const defaultLeague = endpoint === 'brazil-world-cup' ? DEFAULT_THE_SPORTS_DB_WORLD_CUP_LEAGUE_ID : undefined;
  const defaultSeason = endpoint === 'brazil-world-cup' ? DEFAULT_THE_SPORTS_DB_WORLD_CUP_SEASON : undefined;
  const league = firstQueryValue(query.league) ?? process.env.THE_SPORTS_DB_LEAGUE_ID ?? defaultLeague;
  const season = firstQueryValue(query.season) ?? process.env.THE_SPORTS_DB_SEASON ?? defaultSeason;

  const base = `${THE_SPORTS_DB_BASE_URL}/${apiKey}`;

  if (endpoint === 'brazil-world-cup') {
    const urls = [`${base}/eventsnext.php?id=${encodeURIComponent(team)}`, `${base}/eventslast.php?id=${encodeURIComponent(team)}`];

    if (league && season) {
      urls.push(`${base}/eventsseason.php?id=${encodeURIComponent(league)}&s=${encodeURIComponent(season)}`);
    }

    if (league) {
      urls.push(`${base}/eventsnextleague.php?id=${encodeURIComponent(league)}`);
    }

    return urls;
  }

  if (endpoint === 'team-last') {
    return [`${base}/eventslast.php?id=${encodeURIComponent(team)}`];
  }

  if (endpoint === 'league-next') {
    if (!league) throw new Error('Informe league ou THE_SPORTS_DB_LEAGUE_ID.');
    return [`${base}/eventsnextleague.php?id=${encodeURIComponent(league)}`];
  }

  if (endpoint === 'league-last') {
    if (!league) throw new Error('Informe league ou THE_SPORTS_DB_LEAGUE_ID.');
    return [`${base}/eventspastleague.php?id=${encodeURIComponent(league)}`];
  }

  if (endpoint === 'season') {
    if (league && season) {
      return [`${base}/eventsseason.php?id=${encodeURIComponent(league)}&s=${encodeURIComponent(season)}`];
    }

    throw new Error('Informe league/THE_SPORTS_DB_LEAGUE_ID e season/THE_SPORTS_DB_SEASON.');
  }

  return [`${base}/eventsnext.php?id=${encodeURIComponent(team)}`];
}

async function fetchTheSportsDbFixtures(request: ApiRequest, apiKey: string): Promise<SyncedMatch[]> {
  const endpoint = firstQueryValue(request.query?.endpoint) ?? 'brazil-world-cup';
  const teamSearchTerms = getTeamSearchTerms(request);
  const payloads = await Promise.all(getTheSportsDbUrls(request, apiKey).map((url) => fetchJson<TheSportsDbResponse>(url, {}, 'TheSportsDB')));
  const eventsById = new Map<string, TheSportsDbEvent>();

  for (const event of payloads.flatMap((payload) => payload.events ?? payload.event ?? [])) {
    eventsById.set(event.idEvent, event);
  }

  const events = [...eventsById.values()];
  const filteredEvents =
    endpoint === 'brazil-world-cup' || endpoint === 'season'
      ? events.filter((event) => {
          const home = normalizeSearchTerm(event.strHomeTeam ?? '');
          const away = normalizeSearchTerm(event.strAwayTeam ?? '');
          return teamSearchTerms.some((teamName) => home.includes(teamName) || away.includes(teamName));
        })
      : events;

  return filteredEvents.map((event) => ({
    id: null,
    external_api: 'thesportsdb',
    external_match_id: String(event.idEvent),
    championship: event.strLeague ?? 'Seleção Brasileira',
    phase: event.strRound ?? event.strSeason ?? 'Calendário',
    home: event.strHomeTeam ?? 'Mandante',
    away: event.strAwayTeam ?? 'Visitante',
    start_date: getStartDate(event),
    home_goals: toNumber(event.intHomeScore),
    away_goals: toNumber(event.intAwayScore),
    game_minute: toNumber(event.strProgress),
    period: event.strStatus ?? 'Scheduled',
    status: mapTheSportsDbStatusToMatchStatus(event),
  }));
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (request.method === 'OPTIONS') {
    response.status(204).json(null);
    return;
  }

  if (request.method && !['GET', 'POST'].includes(request.method)) {
    response.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const theSportsDbKey = process.env.THE_SPORTS_DB_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    response.status(500).json({
      error: 'Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias.',
    });
    return;
  }

  if (!theSportsDbKey) {
    response.status(500).json({
      error: 'THE_SPORTS_DB_KEY é obrigatória para sincronizar calendário de jogos.',
    });
    return;
  }

  let fixtures: SyncedMatch[];

  try {
    fixtures = await fetchTheSportsDbFixtures(request, theSportsDbKey);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'Erro ao consultar TheSportsDB.',
    });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const synced: SyncedMatch[] = [];

  for (const fixture of fixtures) {
    const { data, error } = await supabase
      .rpc('upsert_match_from_api', {
        p_external_api: fixture.external_api,
        p_external_match_id: fixture.external_match_id,
        p_championship: fixture.championship,
        p_phase: fixture.phase,
        p_home: fixture.home,
        p_away: fixture.away,
        p_start_date: fixture.start_date,
        p_home_goals: fixture.home_goals,
        p_away_goals: fixture.away_goals,
        p_game_minute: fixture.game_minute,
        p_period: fixture.period,
        p_status: fixture.status,
        p_api_data: fixture,
      })
      .returns<unknown>();

    if (error) {
      response.status(500).json({
        error: error.message,
        external_match_id: fixture.external_match_id,
      });
      return;
    }

    synced.push({
      ...fixture,
      id: extractMatchId(data),
    });
  }

  response.status(200).json({
    source: 'thesportsdb',
    total: synced.length,
    synced,
  });
}