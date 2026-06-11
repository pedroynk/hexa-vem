export type UUID = string;

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type MatchStatus = 'AGENDADO' | 'EM_ANDAMENTO' | 'ENCERRADO' | 'CANCELADO';
export type PoolRole = 'ADMIN' | 'PARTICIPANTE';
export type MemberStatus = 'PAGO' | 'PENDENTE' | 'REMOVIDO';

export type Pool = {
  id: UUID;
  name: string;
  code: string;
  created_by?: UUID;
  ticket_value: number;
  current_accumulated?: number;
  status: string;
  created_at?: string;
};

export type PoolMember = {
  pool_id: UUID;
  user_id: UUID;
  display_name: string;
  avatar_url?: string | null;
  role: PoolRole;
  status: MemberStatus;
  paid_value: number;
  paid_at?: string | null;
  pool_name?: string;
  pool_code?: string;
  ticket_value?: number;
  pool_status?: string;
};

export type Match = {
  id: UUID;
  external_api?: string | null;
  external_match_id?: string | number | null;
  championship: string;
  phase: string;
  home: string;
  away: string;
  start_date: string;
  home_goals?: number | null;
  away_goals?: number | null;
  game_minute?: number | null;
  period?: string | null;
  status: MatchStatus;
  api_data?: Json | null;
};

export type PoolMatch = Match & {
  pool_id: UUID;
  match_id: UUID;
  pool_status?: string;
  prize_value?: number | null;
  ticket_value?: number | null;
};

export type PoolMatchEntry = {
  pool_id: UUID;
  match_id: UUID;
  user_id: UUID;
  display_name: string;
  avatar_url?: string | null;
  status: MemberStatus;
  paid_value: number;
  paid_at?: string | null;
};

export type PoolMatchWinner = {
  pool_id: UUID;
  match_id: UUID;
  user_id: UUID;
  display_name: string;
  avatar_url?: string | null;
  gain_value: number;
};

export type Guess = {
  pool_id: UUID;
  match_id: UUID;
  user_id: UUID;
  home_goals: number;
  away_goals: number;
  created_at?: string;
  updated_at?: string;
};

export type Ranking = {
  pool_id: UUID;
  user_id: UUID;
  display_name: string;
  avatar_url?: string | null;
  total_wins: number;
  total_gain: number;
};

export type RpcIdResponse = UUID | { id?: UUID; pool_id?: UUID; match_id?: UUID } | RpcIdResponse[];
