import { useState } from 'react';
import type { Guess, PoolMatch, PoolMatchWinner, UUID } from '../types';
import { formatCurrency, formatDateTime, hasMatchStarted } from '../utils/date';
import { GuessForm } from './GuessForm';

type MatchCardProps = {
  match: PoolMatch;
  guess?: Guess;
  guessesCount: number;
  participantsCount: number;
  currentUserId: UUID;
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

function formatScore(homeGoals?: number | null, awayGoals?: number | null): string {
  const home = homeGoals ?? '-';
  const away = awayGoals ?? '-';
  return `${home} x ${away}`;
}

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

export function MatchCard({ match, guess, guessesCount, participantsCount, currentUserId, winners, onSaveGuess }: MatchCardProps) {
  const [showWinners, setShowWinners] = useState(false);
  const locked = hasMatchStarted(match.start_date) || match.status !== 'AGENDADO';
  const matchId = match.match_id ?? match.id;
  const guessesLabel = participantsCount > 0 ? `${guessesCount}/${participantsCount}` : String(guessesCount);
  const finished = match.status === 'ENCERRADO';
  const currentUserWinner = winners.find((winner) => winner.user_id === currentUserId);

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
        <span className={`status status-${match.status.toLowerCase()}`}>{match.status}</span>
      </div>

      <span className={`match-deadline ${locked ? 'match-deadline-locked' : ''}`}>{formatCloseTime(match.start_date)}</span>

      <div className="match-scoreboard" aria-label={`${match.home} contra ${match.away}`}>
        <div className="match-team">
          <span className="team-flag" aria-hidden="true">
            {getTeamFlag(match.home)}
          </span>
          <strong>{match.home}</strong>
        </div>
        <span className="match-versus">x</span>
        <div className="match-team">
          <span className="team-flag" aria-hidden="true">
            {getTeamFlag(match.away)}
          </span>
          <strong>{match.away}</strong>
        </div>
      </div>

      <div className="match-grid">
        <div>
          <span className="muted">Data</span>
          <strong>{formatDateTime(match.start_date)}</strong>
        </div>
        <div>
          <span className="muted">Placar atual</span>
          <strong>{formatScore(match.home_goals, match.away_goals)}</strong>
        </div>
        <div>
          <span className="muted">Período</span>
          <strong>
            {match.period ?? '-'} {match.game_minute ? `${match.game_minute}'` : ''}
          </strong>
        </div>
        <div>
          <span className="muted">Status do bolão</span>
          <strong>{match.pool_status ?? '-'}</strong>
        </div>
        <div>
          <span className="muted">Em disputa</span>
          <strong>{formatCurrency(match.prize_value ?? 0)}</strong>
        </div>
      </div>

      <div className="match-info-grid">
        <div>
          <span className="match-info-icon" aria-hidden="true">
            ◷
          </span>
          <span className="muted">Horário</span>
          <strong>{formatMatchTime(match.start_date)}</strong>
        </div>
        <div>
          <span className="match-info-icon" aria-hidden="true">
            ⚔
          </span>
          <span className="muted">Confronto</span>
          <strong>{match.phase}</strong>
        </div>
        <div>
          <span className="match-info-icon" aria-hidden="true">
            ◉
          </span>
          <span className="muted">Quem palpitou</span>
          <strong>{guessesLabel}</strong>
        </div>
      </div>

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
