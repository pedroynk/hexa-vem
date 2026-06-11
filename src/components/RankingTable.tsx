import type { Ranking } from '../types';
import { formatCurrency } from '../utils/date';

export function RankingTable({ ranking }: { ranking: Ranking[] }) {
  if (ranking.length === 0) {
    return <div className="empty-state">O ranking ainda não tem vencedores.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Usuário</th>
            <th>Vitórias</th>
            <th>Total ganho</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((item, index) => (
            <tr key={item.user_id}>
              <td>{index + 1}</td>
              <td>
                <div className="person">
                  {item.avatar_url ? <img src={item.avatar_url} alt="" /> : <span className="avatar-fallback" />}
                  <span>{item.display_name}</span>
                </div>
              </td>
              <td>{item.total_wins}</td>
              <td>{formatCurrency(item.total_gain ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
