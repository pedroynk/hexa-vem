type WatchLinkResponse = {
  url?: string;
  query?: string;
  direct?: boolean;
  error?: string;
};

export async function getWatchLink(home: string, away: string): Promise<string> {
  const searchParams = new URLSearchParams({
    home,
    away,
  });
  const response = await fetch(`/api/watch-link?${searchParams.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as WatchLinkResponse;

  if (!response.ok || !payload.url) {
    throw new Error(payload.error ?? 'Erro ao buscar transmissão.');
  }

  return payload.url;
}
