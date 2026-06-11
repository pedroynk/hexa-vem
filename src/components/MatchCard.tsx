import { useState } from 'react';
import { listHeadToHeadMatches } from '../services/head-to-head.service';
import type { Guess, HeadToHeadMatch, PoolMatch, PoolMatchEntry, PoolMatchGuess, PoolMatchWinner, UUID } from '../types';
import { formatCurrency, formatDateTime, hasMatchStarted } from '../utils/date';
import { GuessForm } from './GuessForm';

type MatchCardProps = {
  match: PoolMatch;
  guess?: Guess;
  guessesCount: number;
  matchGuesses: PoolMatchGuess[];
  participantsCount: number;
  currentUserId: UUID;
  userEntry?: PoolMatchEntry;
  accumulatedValue: number;
  winners: PoolMatchWinner[];
  onSaveGuess: (matchId: string, homeGoals: number, awayGoals: number) => Promise<void>;
};

const teamFlags: Record<string, string> = {
  brasil: '🇧🇷',
  brazil: '🇧🇷',
  mexico: '🇲🇽',
  méxico: '🇲🇽',
  'africa do sul': '🇿🇦',
  'áfrica do sul': '🇿🇦',
  'south africa': '🇿🇦',
  'coreia do sul': '🇰🇷',
  'south korea': '🇰🇷',
  marrocos: '🇲🇦',
  morocco: '🇲🇦',
  'republica tcheca': '🇨🇿',
  'república tcheca': '🇨🇿',
  czechia: '🇨🇿',
  argentina: '🇦🇷',
  franca: '🇫🇷',
  frança: '🇫🇷',
  france: '🇫🇷',
  alemanha: '🇩🇪',
  germany: '🇩🇪',
  espanha: '🇪🇸',
  spain: '🇪🇸',
  portugal: '🇵🇹',
  inglaterra: '🇬🇧',
  england: '🏴',
  uruguai: '🇺🇾',
  uruguay: '🇺🇾',
};

function normalizeTeamName(teamName: string): string {
  return teamName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getTeamFlag(teamName: string): string {
  const normalized = normalizeTeamName(teamName);
  return teamFlags[teamName.trim().toLowerCase()] ?? teamFlags[normalized] ?? '🏳️';
}

function formatMatchTime(startDate: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(startDate));
}

function formatMatchDate(startDate: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(startDate));
}

function formatCloseTime(startDate: string): string {
  const diffInMinutes = Math.ceil((new Date(startDate).getTime() - Date.now()) / 60_000);

  if (diffInMinutes <= 0) {
    return 'Fechado';
  }

  if (diffInMinutes < 60) {
    return `Fecha em ${diffInMinutes} min`;
  }

  const diffInHours = Math.ceil(diffInMinutes / 60);

  if (diffInHours < 24) {
    return `Fecha em ${diffInHours} ${diffInHours === 1 ? 'hora' : 'horas'}`;
  }

  const diffInDays = Math.ceil(diffInHours / 24);
  return `Fecha em ${diffInDays} ${diffInDays === 1 ? 'dia' : 'dias'}`;
}

function getCazeTvUrl(match: PoolMatch): string {
  const query = new URLSearchParams({
    query: `CazéTV ${match.home} x ${match.away} ${match.championship}`,
  });

  return `https://www.youtube.com/@CazeTV/search?${query.toString()}`;
}

function formatHeadToHeadScore(match: HeadToHeadMatch): string {
  const home = match.home_goals ?? '-';
  const away = match.away_goals ?? '-';

  return `${home} x ${away}`;
}

function formatMatchStatus(status: PoolMatch['status']): string {
  if (status === 'ENCERRADO') return 'Finalizado';
  if (status === 'EM_ANDAMENTO') return 'Ao vivo';
  if (status === 'CANCELADO') return 'Cancelado';
  return 'Agendado';
}

function formatPoolStatus(status?: string): string | null {
  if (!status) return null;

  const normalized = status.replaceAll('_', ' ').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function MatchCard({
  match,
  guess,
  guessesCount,
  matchGuesses,
  participantsCount,
  currentUserId,
  userEntry,
  accumulatedValue,
  winners,
  onSaveGuess,
}: MatchCardProps) {
  const [showWinners, setShowWinners] = useState(false);
  const [showGuesses, setShowGuesses] = useState(false);
  const [showHeadToHead, setShowHeadToHead] = useState(false);
  const [headToHeadMatches, setHeadToHeadMatches] = useState<HeadToHeadMatch[]>([]);
  const [headToHeadLoading, setHeadToHeadLoading] = useState(false);
  const [headToHeadError, setHeadToHeadError] = useState<string | null>(null);
  const locked = hasMatchStarted(match.start_date) || match.status !== 'AGENDADO';
  const matchId = match.match_id ?? match.id;
  const guessesLabel = participantsCount > 0 ? `${guessesCount}/${participantsCount}` : String(guessesCount);
  const finished = match.status === 'ENCERRADO';
  const currentUserWinner = winners.find((winner) => winner.user_id === currentUserId);
  const userEntryStatus = userEntry?.status ?? 'PENDENTE';

  async function handleToggleHeadToHead() {
    const nextShowHeadToHead = !showHeadToHead;
    setShowHeadToHead(nextShowHeadToHead);

    if (!nextShowHeadToHead || headToHeadMatches.length > 0 || headToHeadLoading) {
      return;
    }

    try {
      setHeadToHeadLoading(true);
      setHeadToHeadError(null);
      setHeadToHeadMatches(await listHeadToHeadMatches(match.home, match.away));
    } catch (error) {
      setHeadToHeadError(error instanceof Error ? error.message : 'Erro ao carregar confrontos.');
    } finally {
      setHeadToHeadLoading(false);
    }
  }

  return (
    <article className="card match-card">
      <div className="match-card-top">
        <div>
          <p className="eyebrow">
            {match.championship} · {match.phase}
          </p>
          <h3>
            {match.home} x {match.away}
          </h3>
        </div>
        <div className="match-header-statuses">
          <span className={`status status-${match.status.toLowerCase()}`}>{formatMatchStatus(match.status)}</span>
          {formatPoolStatus(match.pool_status) ? <span className="pill pool-status-pill">{formatPoolStatus(match.pool_status)}</span> : null}
        </div>
      </div>

      <div className="match-scoreboard" aria-label={`${match.home} contra ${match.away}`}>
        <div className="match-team">
          <span className="team-flag" aria-hidden="true">
            {getTeamFlag(match.home)}
          </span>
          <strong>{match.home}</strong>
        </div>
        <div className="match-center-score">
          <span className="match-center-date">
            {formatMatchDate(match.start_date)} · {formatMatchTime(match.start_date)}
          </span>
          <strong className="main-score">
            <span>{match.home_goals ?? '-'}</span>
            <span className="score-separator">-</span>
            <span>{match.away_goals ?? '-'}</span>
          </strong>
        </div>
        <div className="match-team">
          <span className="team-flag" aria-hidden="true">
            {getTeamFlag(match.away)}
          </span>
          <strong>{match.away}</strong>
        </div>
      </div>

      <div className="match-quick-summary">
        <span>{locked ? 'Palpites encerrados' : formatCloseTime(match.start_date)}</span>
        <span>
          Entrada <strong className={userEntryStatus === 'PAGO' ? 'success-text' : 'warning-text'}>{userEntryStatus}</strong>
        </span>
        <span>
          Palpite <strong>{guess ? `${guess.home_goals} x ${guess.away_goals}` : 'Sem palpite'}</strong>
        </span>
        <span>
          Prêmio <strong>{formatCurrency(match.prize_value ?? 0)}</strong>
        </span>
        {match.period ? (
          <span>
            Tempo <strong>{match.period}</strong>
          </span>
        ) : null}
        {accumulatedValue > 0 ? (
          <span>
            Acumulado <strong>{formatCurrency(accumulatedValue)}</strong>
          </span>
        ) : null}
      </div>

      <div className="match-action-row">
        <button type="button" className="match-action-button" onClick={() => window.open(getCazeTvUrl(match), '_blank', 'noopener,noreferrer')}>
          Assistir na CazéTV
        </button>
        <button type="button" className="match-action-button" onClick={() => void handleToggleHeadToHead()}>
          Histórico
        </button>
        <button type="button" className="match-action-button" onClick={() => setShowGuesses((currentValue) => !currentValue)}>
          Palpites {guessesLabel}
        </button>
      </div>

      {showHeadToHead ? (
        <div className="match-panel">
          <strong>Últimos confrontos</strong>
          {headToHeadLoading ? <span className="muted">Carregando confrontos...</span> : null}
          {headToHeadError ? <span className="error-text">{headToHeadError}</span> : null}
          {!headToHeadLoading && !headToHeadError && headToHeadMatches.length === 0 ? <span className="muted">Nenhum confronto encontrado.</span> : null}
          {headToHeadMatches.map((headToHeadMatch) => (
            <div key={headToHeadMatch.id} className="match-panel-row">
              <span>
                {headToHeadMatch.home} {formatHeadToHeadScore(headToHeadMatch)} {headToHeadMatch.away}
              </span>
              <span className="muted">{formatDateTime(headToHeadMatch.start_date)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {showGuesses ? (
        <div className="match-panel">
          <strong>Palpites enviados</strong>
          {matchGuesses.length === 0 ? <span className="muted">Ninguém palpitou ainda.</span> : null}
          {matchGuesses.map((matchGuess) => (
            <div key={`${matchId}-${matchGuess.user_id}`} className="match-panel-row">
              <span>{matchGuess.display_name}</span>
              <strong>
                {matchGuess.home_goals} x {matchGuess.away_goals}
              </strong>
            </div>
          ))}
        </div>
      ) : null}

      {finished ? (
        <div className={`user-outcome-card ${currentUserWinner ? 'user-outcome-win' : 'user-outcome-loss'}`}>
          <div className="user-outcome-copy">
            <span className="muted">Resultado do seu palpite</span>
            <strong>{guess ? `${guess.home_goals} x ${guess.away_goals}` : 'Sem palpite'}</strong>
            <p>
              {currentUserWinner
                ? 'Você acertou o placar e levou o prêmio.'
                : guess
                  ? 'Não foi dessa vez.'
                  : 'Você não palpitou neste jogo.'}
            </p>
          </div>
          {currentUserWinner ? (
            <div className="user-outcome-prize">
              <span>Você ganhou</span>
              <strong>{formatCurrency(currentUserWinner.gain_value)}</strong>
            </div>
          ) : null}
          {winners.length > 0 ? (
            <button type="button" className="button small ghost" onClick={() => setShowWinners((currentValue) => !currentValue)}>
              {showWinners ? 'Ocultar vencedores' : 'Ver vencedores'}
            </button>
          ) : (
            <span className="muted">Nenhum vencedor.</span>
          )}

          {showWinners ? (
            <div className="winner-list">
              {winners.map((winner) => (
                <div key={`${winner.match_id}-${winner.user_id}`} className="winner-row">
                  <span>{winner.display_name}</span>
                  <strong>{formatCurrency(winner.gain_value)}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <GuessForm
          key={`${matchId}-${guess?.home_goals ?? ''}-${guess?.away_goals ?? ''}`}
          guess={guess}
          disabled={locked}
          onSubmit={(homeGoals, awayGoals) => onSaveGuess(matchId, homeGoals, awayGoals)}
        />
      )}
    </article>
  );
}
