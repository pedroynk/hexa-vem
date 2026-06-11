import type { MatchStatus } from '../types';

export function mapApiFootballStatusToMatchStatus(shortStatus: string): MatchStatus {
  const normalizedStatus = shortStatus.toUpperCase();

  if (['NS', 'TBD'].includes(normalizedStatus)) {
    return 'AGENDADO';
  }

  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(normalizedStatus)) {
    return 'EM_ANDAMENTO';
  }

  if (['FT', 'AET', 'PEN'].includes(normalizedStatus)) {
    return 'ENCERRADO';
  }

  if (['CANC', 'PST', 'ABD', 'AWD', 'WO'].includes(normalizedStatus)) {
    return 'CANCELADO';
  }

  return 'AGENDADO';
}
