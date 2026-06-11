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
};

const THE_SPORTS_DB_BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    const payload = await fetchJson<TheSportsDbHeadToHeadResponse>(
      `${THE_SPORTS_DB_BASE_URL}/${apiKey}/eventsh2h.php?first=${encodeURIComponent(home)}&second=${encodeURIComponent(away)}`,
    );
    const events = payload.event ?? payload.events ?? [];

    response.status(200).json({
      matches: events
        .map(mapEvent)
        .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
        .slice(0, 8),
    });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : 'Erro ao consultar confrontos.' });
  }
}
