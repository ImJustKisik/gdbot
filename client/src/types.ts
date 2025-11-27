export interface Warning {
  reason: string;
  points: number;
  date: string;
  moderator: string;
}

export interface User {
  id: string;
  username: string;
  avatar: string;
  points: number;
  warnings: Warning[];
  status: 'Verified' | 'Muted';
}
