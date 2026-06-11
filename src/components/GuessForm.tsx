import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Guess } from '../types';

type GuessFormProps = {
  guess?: Guess;
  disabled: boolean;
  onSubmit: (homeGoals: number, awayGoals: number) => Promise<void>;
};

export function GuessForm({ guess, disabled, onSubmit }: GuessFormProps) {
  const [homeGoals, setHomeGoals] = useState(guess ? String(guess.home_goals) : '');
  const [awayGoals, setAwayGoals] = useState(guess ? String(guess.away_goals) : '');
  const [editing, setEditing] = useState(!guess);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (homeGoals === '' || awayGoals === '') {
      setError('Informe os dois placares.');
      return;
    }

    const parsedHomeGoals = Number(homeGoals);
    const parsedAwayGoals = Number(awayGoals);

    if (!Number.isInteger(parsedHomeGoals) || !Number.isInteger(parsedAwayGoals)) {
      setError('Informe placares inteiros.');
      return;
    }

    try {
      setSaving(true);
      await onSubmit(parsedHomeGoals, parsedAwayGoals);
      setSuccess(true);
      setEditing(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao salvar palpite.');
    } finally {
      setSaving(false);
    }
  }

  if (guess && !editing) {
    return (
      <div className="guess-summary">
        <div>
          <span className="muted">Seu palpite</span>
          <strong>
            {guess.home_goals} x {guess.away_goals}
          </strong>
          {success ? <p className="success-text">Palpite salvo!</p> : null}
        </div>
        <button
          type="button"
          className="button small ghost edit-guess-button"
          disabled={disabled}
          onClick={() => {
            setHomeGoals(String(guess.home_goals));
            setAwayGoals(String(guess.away_goals));
            setError(null);
            setSuccess(false);
            setEditing(true);
          }}
        >
          <span aria-hidden="true">✎</span>
          Alterar
        </button>
        {disabled ? <p className="muted">Palpites bloqueados para este jogo.</p> : null}
      </div>
    );
  }

  return (
    <form className="guess-form" onSubmit={handleSubmit}>
      <div className="score-inputs">
        <input
          type="number"
          min="0"
          value={homeGoals}
          disabled={disabled || saving}
          onChange={(event) => {
            setHomeGoals(event.target.value);
            setSuccess(false);
          }}
          aria-label="Palpite gols mandante"
        />
        <span>x</span>
        <input
          type="number"
          min="0"
          value={awayGoals}
          disabled={disabled || saving}
          onChange={(event) => {
            setAwayGoals(event.target.value);
            setSuccess(false);
          }}
          aria-label="Palpite gols visitante"
        />
      </div>
      <button type="submit" className="button" disabled={disabled || saving}>
        {saving ? 'Salvando...' : guess ? 'Salvar alteração' : 'Salvar palpite'}
      </button>
      {guess ? (
        <button
          type="button"
          className="button ghost"
          disabled={saving}
          onClick={() => {
            setHomeGoals(String(guess.home_goals));
            setAwayGoals(String(guess.away_goals));
            setError(null);
            setSuccess(false);
            setEditing(false);
          }}
        >
          Cancelar
        </button>
      ) : null}
      {disabled ? <p className="muted">Palpites bloqueados para este jogo.</p> : null}
      {success ? <p className="success-text">Palpite salvo!</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </form>
  );
}
