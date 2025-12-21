import api from './client';

export interface Invite {
  code: string;
  uses: number;
  inviter: {
    id: string;
    username: string;
    avatar: string;
  } | null;
  alias: string | null;
  url: string;
}

export interface InviteJoin {
  id: string;
  username: string;
  avatar: string | null;
  joinedAt: string;
  points: number;
}

export const invitesApi = {
  getAll: () => api.get<Invite[]>('/invites').then((res) => res.data),
  setAlias: (code: string, alias: string) => api.post(`/invites/${code}/alias`, { alias }).then((res) => res.data),
  getJoins: (code: string) => api.get<InviteJoin[]>(`/invites/${code}/joins`).then((res) => res.data),
};
