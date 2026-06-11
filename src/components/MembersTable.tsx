import type { Guess, PoolMatch, PoolMember } from '../types';
import { formatCurrency, formatDateTime } from '../utils/date';

type MembersTableProps = {
  members: PoolMember[];
  matches?: PoolMatch[];
  guesses?: Guess[];
};

function getMatchLabel(match: PoolMatch): string {
  return `${match.home.slice(0, 3).toUpperCase()} x ${match.away.slice(0, 3).toUpperCase()}`;
}

export function MembersTable({ members, matches = [], guesses = [] }: MembersTableProps) {
  if (members.length === 0) {
    return <div className="empty-state">Nenhum participante encontrado.</div>;
  }

  const guessesByUserId = new Map<string, Guess[]>();

  for (const guess of guesses) {
    const userGuesses = guessesByUserId.get(guess.user_id) ?? [];
    userGuesses.push(guess);
    guessesByUserId.set(guess.user_id, userGuesses);
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Participante</th>
            <th>Papel</th>
            <th>Status</th>
            <th>Valor pago</th>
            <th>Pagamento</th>
            <th>Palpites</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const memberGuesses = guessesByUserId.get(member.user_id) ?? [];

            return (
              <tr key={member.user_id}>
                <td>
                  <div className="person">
                    {member.avatar_url ? <img src={member.avatar_url} alt="" /> : <span className="avatar-fallback" />}
                    <span>{member.display_name}</span>
                  </div>
                </td>
                <td>{member.role}</td>
                <td>
                  <span className={`pill pill-${member.status.toLowerCase()}`}>{member.status}</span>
                </td>
                <td>{formatCurrency(member.paid_value ?? 0)}</td>
                <td>{member.paid_at ? formatDateTime(member.paid_at) : '-'}</td>
                <td>
                  {memberGuesses.length > 0 ? (
                    <div className="guess-chips">
                      {memberGuesses.map((guess) => {
                        const match = matches.find((poolMatch) => poolMatch.match_id === guess.match_id || poolMatch.id === guess.match_id);

                        return (
                          <span key={`${guess.user_id}-${guess.match_id}`} className="guess-chip">
                            {match ? `${getMatchLabel(match)}: ` : ''}
                            {guess.home_goals} x {guess.away_goals}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="muted">Sem palpite</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
