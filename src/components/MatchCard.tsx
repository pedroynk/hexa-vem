import type { Guess, PoolMatch } from '../types';
import { formatCurrency, formatDateTime, hasMatchStarted } from '../utils/date';
import { GuessForm } from './GuessForm';

type MatchCardProps = {
  match: PoolMatch;
  guess?: Guess;
  onSaveGuess: (matchId: string, homeGoals: number, awayGoals: number) => Promise<void>;
};

function formatScore(homeGoals?: number | null, awayGoals?: number | null): string {
  const home = homeGoals ?? '-';
  const away = awayGoals ?? '-';
  return `${home} x ${away}`;
}

export function MatchCard({ match, guess, onSaveGuess }: MatchCardProps) {
  const locked = hasMatchStarted(match.start_date) || match.status !== 'AGENDADO';
  const matchId = match.match_id ?? match.id;

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

      <GuessForm
        key={`${matchId}-${guess?.home_goals ?? ''}-${guess?.away_goals ?? ''}`}
        guess={guess}
        disabled={locked}
        onSubmit={(homeGoals, awayGoals) => onSaveGuess(matchId, homeGoals, awayGoals)}
      />
    </article>
  );
}
