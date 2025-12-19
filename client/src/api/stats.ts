import api from './client';

interface ActivityStat {
  day: string;
  count: number;
}

interface GuildStat {
  id: string;
  name: string;
  icon: string;
  count: number;
}

export const statsApi = {
  getActivity: () => api.get<ActivityStat[]>('/stats/activity').then((res) => res.data),
  getGuilds: () => api.get<GuildStat[]>('/stats/guilds').then((res) => res.data),
};
