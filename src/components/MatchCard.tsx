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

function formatFlagScore(match: PoolMatch): string {
  const homeGoals = match.home_goals ?? '-';
  const awayGoals = match.away_goals ?? '-';

  return `${getTeamFlag(match.home)} ${homeGoals} x ${awayGoals} ${getTeamFlag(match.away)}`;
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
      <div className="match-header">
        <div>
          <p className="eyebrow">
            {match.championship} · {match.phase}
          </p>
          <h3>
            {match.home} x {match.away}
          </h3>
        </div>
        <div className="match-header-statuses">
          {match.pool_status ? <span className="pill pool-status-pill">{match.pool_status}</span> : null}
          <span className={`status status-${match.status.toLowerCase()}`}>{match.status}</span>
        </div>
      </div>

      <span className={`match-deadline ${locked ? 'match-deadline-locked' : ''}`}>{formatCloseTime(match.start_date)}</span>

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
          <span className="match-versus">x</span>
          <strong className="flag-score">{formatFlagScore(match)}</strong>
        </div>
        <div className="match-team">
          <span className="team-flag" aria-hidden="true">
            {getTeamFlag(match.away)}
          </span>
          <strong>{match.away}</strong>
        </div>
      </div>

      {locked ? <div className="match-locked-banner">Palpites encerrados para este jogo.</div> : null}

      <div className="match-quick-summary">
        <span>
          Entrada <strong className={userEntryStatus === 'PAGO' ? 'success-text' : 'warning-text'}>{userEntryStatus}</strong>
        </span>
        <span>
          Palpite <strong>{guess ? `${guess.home_goals} x ${guess.away_goals}` : 'Sem palpite'}</strong>
        </span>
        <span>
          Período{' '}
          <strong>
            {match.period ?? '-'} {match.game_minute ? `${match.game_minute}'` : ''}
          </strong>
        </span>
        <span>
          Em disputa <strong>{formatCurrency(match.prize_value ?? 0)}</strong>
        </span>
        {accumulatedValue > 0 ? (
          <span>
            Acumulado <strong>{formatCurrency(accumulatedValue)}</strong>
          </span>
        ) : null}
      </div>

      <div className="match-info-grid">
        <button type="button" className="match-info-action" onClick={() => window.open(getCazeTvUrl(match), '_blank', 'noopener,noreferrer')}>
          <span className="match-info-icon" aria-hidden="true">
            ◷
          </span>
          <span className="muted">Horário</span>
          <strong>{formatMatchTime(match.start_date)}</strong>
        </button>
        <button type="button" className="match-info-action" onClick={() => void handleToggleHeadToHead()}>
          <span className="match-info-icon" aria-hidden="true">
            ⚔
          </span>
          <span className="muted">Confronto</span>
          <strong>{match.phase}</strong>
        </button>
        <button type="button" className="match-info-action" onClick={() => setShowGuesses((currentValue) => !currentValue)}>
          <span className="match-info-icon" aria-hidden="true">
            ◉
          </span>
          <span className="muted">Quem palpitou</span>
          <strong>{guessesLabel}</strong>
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

      <GuessForm
        key={`${matchId}-${guess?.home_goals ?? ''}-${guess?.away_goals ?? ''}`}
        guess={guess}
        disabled={locked}
        onSubmit={(homeGoals, awayGoals) => onSaveGuess(matchId, homeGoals, awayGoals)}
      />

      {finished ? (
        <div className={`match-result-box ${currentUserWinner ? 'match-result-win' : 'match-result-loss'}`}>
          <div>
            <span className="muted">Seu resultado</span>
            <strong>
              {currentUserWinner
                ? `Você ganhou ${formatCurrency(currentUserWinner.gain_value)}`
                : guess
                  ? 'Você perdeu este jogo.'
                  : 'Você não palpitou neste jogo.'}
            </strong>
          </div>
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
      ) : null}
    </article>
  );
}
