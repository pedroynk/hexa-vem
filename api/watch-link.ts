/// <reference types="node" />

import type { Json } from '../src/types.js';

type ApiRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: Json) => void;
  setHeader: (name: string, value: string) => void;
};

type YouTubeSearchResponse = {
  items?: Array<{
    id?: {
      videoId?: string;
    };
    snippet?: {
      title?: string;
      channelTitle?: string;
    };
  }>;
};

const teamPortugueseNames: Record<string, string> = {
  brazil: 'BRASIL',
  brasil: 'BRASIL',
  mexico: 'MÉXICO',
  méxico: 'MÉXICO',
  morocco: 'MARROCOS',
  marrocos: 'MARROCOS',
  'south africa': 'ÁFRICA DO SUL',
  'africa do sul': 'ÁFRICA DO SUL',
  'áfrica do sul': 'ÁFRICA DO SUL',
  algeria: 'ARGÉLIA',
  argelia: 'ARGÉLIA',
  argélia: 'ARGÉLIA',
  austria: 'ÁUSTRIA',
  áustria: 'ÁUSTRIA',
};
const knownWatchLinks: Record<string, string> = {
  'brasil|marrocos': 'https://www.youtube.com/watch?v=vC3fV_awcWE',
  'brazil|morocco': 'https://www.youtube.com/watch?v=vC3fV_awcWE',
  'brasil|haiti': 'https://www.youtube.com/watch?v=DUuWdi0r1RI',
  'brazil|haiti': 'https://www.youtube.com/watch?v=DUuWdi0r1RI',
  'brasil|escocia': 'https://www.youtube.com/watch?v=dxYTTxhgVNU',
  'brasil|escócia': 'https://www.youtube.com/watch?v=dxYTTxhgVNU',
  'brazil|scotland': 'https://www.youtube.com/watch?v=dxYTTxhgVNU',
};

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSearchTerm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getPortugueseTeamName(teamName: string): string {
  return teamPortugueseNames[teamName.trim().toLowerCase()] ?? teamPortugueseNames[normalizeSearchTerm(teamName)] ?? teamName.toUpperCase();
}

function getCazeTvQuery(home: string, away: string): string {
  return `AO VIVO: ${getPortugueseTeamName(home)} X ${getPortugueseTeamName(away)} | COPA DO MUNDO FIFA™ 2026`;
}

function getSearchUrl(query: string): string {
  return `https://www.youtube.com/@CazeTV/search?${new URLSearchParams({ query }).toString()}`;
}

function getKnownWatchLink(home: string, away: string): string | null {
  const homeTerm = normalizeSearchTerm(home);
  const awayTerm = normalizeSearchTerm(away);

  return knownWatchLinks[`${homeTerm}|${awayTerm}`] ?? knownWatchLinks[`${awayTerm}|${homeTerm}`] ?? null;
}

async function findYouTubeVideoUrl(query: string, apiKey: string): Promise<string | null> {
  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '10',
    q: `${query} CazéTV`,
    key: apiKey,
  });
  const apiResponse = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`);

  if (!apiResponse.ok) {
    throw new Error(`Erro ao consultar YouTube: HTTP ${apiResponse.status}.`);
  }

  const payload = (await apiResponse.json()) as YouTubeSearchResponse;
  const queryTerms = normalizeSearchTerm(query)
    .split(/\s+/)
    .filter((term) => term.length > 2);
  const video =
    payload.items?.find((item) => {
      const title = normalizeSearchTerm(item.snippet?.title ?? '');
      const channelTitle = normalizeSearchTerm(item.snippet?.channelTitle ?? '');

      return channelTitle.includes('caze') && queryTerms.every((term) => title.includes(term));
    }) ?? payload.items?.find((item) => normalizeSearchTerm(item.snippet?.channelTitle ?? '').includes('caze'));

  return video?.id?.videoId ? `https://www.youtube.com/watch?v=${video.id.videoId}` : null;
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

  const home = firstQueryValue(request.query?.home);
  const away = firstQueryValue(request.query?.away);

  if (!home || !away) {
    response.status(400).json({ error: 'Informe home e away.' });
    return;
  }

  const query = getCazeTvQuery(home, away);
  const fallbackUrl = getSearchUrl(query);
  const knownWatchLink = getKnownWatchLink(home, away);
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;

  if (knownWatchLink) {
    response.status(200).json({ url: knownWatchLink, query, direct: true });
    return;
  }

  if (!youtubeApiKey) {
    response.status(200).json({ url: fallbackUrl, query, direct: false });
    return;
  }

  try {
    const directUrl = await findYouTubeVideoUrl(query, youtubeApiKey);
    response.status(200).json({ url: directUrl ?? fallbackUrl, query, direct: Boolean(directUrl) });
  } catch {
    response.status(200).json({ url: fallbackUrl, query, direct: false });
  }
}
