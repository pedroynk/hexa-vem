/// <reference types="node" />

import type { HeadToHeadMatch, Json } from '../src/types.js';

type ApiRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: Json) => void;
  setHeader: (name: string, value: string) => void;
};

type TheSportsDbEvent = {
  idEvent?: string | null;
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strTimestamp?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strLeague?: string | null;
  strSeason?: string | null;
};

type TheSportsDbHeadToHeadResponse = {
  event?: TheSportsDbEvent[] | null;
  events?: TheSportsDbEvent[] | null;
  eventvs?: TheSportsDbEvent[] | null;
};

type TheSportsDbTeam = {
  idTeam?: string | null;
  strTeam?: string | null;
};

type TheSportsDbTeamResponse = {
  teams?: TheSportsDbTeam[] | null;
};

const THE_SPORTS_DB_BASE_URL = 'https://www.thesportsdb.com/api/v1/json';
const DEFAULT_WORLD_CUP_LEAGUE_ID = '4429';
const DEFAULT_WORLD_CUP_SEASON = '2026';
const teamSearchAliases: Record<string, string> = {
  brasil: 'Brazil',
  brazil: 'Brazil',
  mexico: 'Mexico',
  méxico: 'Mexico',
  marrocos: 'Morocco',
  morocco: 'Morocco',
  'africa do sul': 'South Africa',
  'áfrica do sul': 'South Africa',
  'south africa': 'South Africa',
  argelia: 'Algeria',
  argélia: 'Algeria',
  algeria: 'Algeria',
  austria: 'Austria',
  áustria: 'Austria',
};

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSearchTerm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getTeamSearchName(teamName: string): string {
  return teamSearchAliases[teamName.trim().toLowerCase()] ?? teamSearchAliases[normalizeSearchTerm(teamName)] ?? teamName;
}

function getStartDate(event: TheSportsDbEvent): string {
  if (event.strTimestamp) return new Date(event.strTimestamp).toISOString();

  const date = event.dateEvent ?? new Date().toISOString().slice(0, 10);
  const rawTime = event.strTime?.trim() ?? '00:00:00';
  const time = /(?:z|[+-]\d{2}:?\d{2})$/i.test(rawTime) ? rawTime : `${rawTime}Z`;
  const parsedDate = new Date(`${date}T${time}`);

  return Number.isNaN(parsedDate.getTime()) ? `${date}T${rawTime}` : parsedDate.toISOString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const apiResponse = await fetch(url);

  if (!apiResponse.ok) {
    throw new Error(`Erro ao consultar TheSportsDB: HTTP ${apiResponse.status}.`);
  }

  const body = await apiResponse.text();
  if (!body.trim()) {
    return {} as T;
  }

  return JSON.parse(body) as T;
}

async function findTeamId(apiKey: string, teamName: string): Promise<string | null> {
  const searchName = getTeamSearchName(teamName);
  const payload = await fetchJson<TheSportsDbTeamResponse>(
    `${THE_SPORTS_DB_BASE_URL}/${apiKey}/searchteams.php?t=${encodeURIComponent(searchName)}`,
  );
  const normalizedSearchName = normalizeSearchTerm(searchName);
  const team =
    payload.teams?.find((currentTeam) => normalizeSearchTerm(currentTeam.strTeam ?? '') === normalizedSearchName) ??
    payload.teams?.[0];

  return team?.idTeam ?? null;
}

function mapEvent(event: TheSportsDbEvent): HeadToHeadMatch {
  return {
    id: event.idEvent ?? `${event.strHomeTeam}-${event.strAwayTeam}-${event.strTimestamp ?? event.dateEvent ?? ''}`,
    home: event.strHomeTeam ?? 'Mandante',
    away: event.strAwayTeam ?? 'Visitante',
    home_goals: toNumber(event.intHomeScore),
    away_goals: toNumber(event.intAwayScore),
    start_date: getStartDate(event),
    league: event.strLeague ?? null,
    season: event.strSeason ?? null,
  };
}

async function fetchHeadToHeadByTeamIds(apiKey: string, home: string, away: string): Promise<TheSportsDbEvent[]> {
  const [homeTeamId, awayTeamId] = await Promise.all([findTeamId(apiKey, home), findTeamId(apiKey, away)]);

  if (!homeTeamId || !awayTeamId) {
    return [];
  }

  const payload = await fetchJson<TheSportsDbHeadToHeadResponse>(
    `${THE_SPORTS_DB_BASE_URL}/${apiKey}/eventsvs.php?id1=${encodeURIComponent(homeTeamId)}&id2=${encodeURIComponent(awayTeamId)}`,
  );

  return payload.eventvs ?? payload.event ?? payload.events ?? [];
}

async function fetchHeadToHeadFromWorldCupSeason(apiKey: string, home: string, away: string): Promise<TheSportsDbEvent[]> {
  const payload = await fetchJson<TheSportsDbHeadToHeadResponse>(
    `${THE_SPORTS_DB_BASE_URL}/${apiKey}/eventsseason.php?id=${DEFAULT_WORLD_CUP_LEAGUE_ID}&s=${DEFAULT_WORLD_CUP_SEASON}`,
  );
  const homeTerm = normalizeSearchTerm(getTeamSearchName(home));
  const awayTerm = normalizeSearchTerm(getTeamSearchName(away));
  const events = payload.events ?? payload.event ?? [];

  return events.filter((event) => {
    const currentHome = normalizeSearchTerm(event.strHomeTeam ?? '');
    const currentAway = normalizeSearchTerm(event.strAwayTeam ?? '');

    return (currentHome.includes(homeTerm) && currentAway.includes(awayTerm)) || (currentHome.includes(awayTerm) && currentAway.includes(homeTerm));
  });
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (request.method === 'OPTIONS') {
    response.status(204).json(null);
    return;
  }

  if (request.method && request.method !== 'GET') {
    response.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const apiKey = process.env.THE_SPORTS_DB_KEY;
  const home = firstQueryValue(request.query?.home);
  const away = firstQueryValue(request.query?.away);

  if (!apiKey) {
    response.status(500).json({ error: 'THE_SPORTS_DB_KEY é obrigatória.' });
    return;
  }

  if (!home || !away) {
    response.status(400).json({ error: 'Informe home e away.' });
    return;
  }

  try {
    const eventsById = new Map<string, TheSportsDbEvent>();
    const [teamIdEvents, seasonEvents] = await Promise.all([
      fetchHeadToHeadByTeamIds(apiKey, home, away).catch(() => []),
      fetchHeadToHeadFromWorldCupSeason(apiKey, home, away).catch(() => []),
    ]);

    for (const event of [...teamIdEvents, ...seasonEvents]) {
      eventsById.set(event.idEvent ?? `${event.strHomeTeam}-${event.strAwayTeam}-${event.strTimestamp ?? event.dateEvent ?? ''}`, event);
    }

    response.status(200).json({
      matches: [...eventsById.values()]
        .map(mapEvent)
        .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
        .slice(0, 8),
    });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : 'Erro ao consultar confrontos.' });
  }
}
