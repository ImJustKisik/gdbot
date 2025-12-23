import api from './client';

export interface AiUsageSummary {
  rangeDays: number;
  totals: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    cost: number;
  };
  byModel: Array<{
    model: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    cost: number;
  }>;
  byContext: Array<{
    context: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    cost: number;
  }>;
  daily: Array<{
    day: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    cost: number;
  }>;
}

export interface MonitorUserEntry {
  id: string;
  username: string;
  avatar: string | null;
  detoxifyEnabled: boolean;
  aiPingEnabled: boolean;
}

export interface MonitorChannelEntry {
  id: string;
  name: string;
  detoxifyEnabled: boolean;
  aiPingEnabled: boolean;
}

export interface MonitorSnapshot {
  users: MonitorUserEntry[];
  channels: MonitorChannelEntry[];
  settings: {
    aiEnabled: boolean;
    aiAction: string;
    aiThreshold: number;
  };
}

export const aiApi = {
  getUsageSummary: (days = 30) =>
    api.get<AiUsageSummary>(`/stats/ai/usage?days=${days}`).then((res) => res.data),

  getMonitorSnapshot: () =>
    api.get<MonitorSnapshot>('/monitoring').then((res) => res.data),

  updateUserMonitor: (userId: string, payload: { isMonitored: boolean; detoxifyEnabled?: boolean; aiPingEnabled?: boolean }) =>
    api.post(`/monitoring/users/${userId}`, payload).then((res) => res.data),

  updateChannelMonitor: (
    channelId: string,
    payload: { enabled: boolean; detoxifyEnabled?: boolean; aiPingEnabled?: boolean }
  ) => api.post(`/monitoring/channels/${channelId}`, payload).then((res) => res.data),
};
