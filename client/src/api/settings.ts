import api from './client';

export interface Settings {
  logChannelId: string;
  modLogChannelId: string;
  verificationChannelId: string;
  roleUnverified: string;
  roleVerified: string;
  autoMuteThreshold: number;
  autoMuteDuration: number;
  aiEnabled?: boolean;
  aiPingUser?: boolean; // New field
  aiThreshold?: number;
  aiAction?: string;
  aiPrompt?: string;
  aiBatchPrompt?: string; // New field
  aiRules?: string;
  appealsEnabled?: boolean;
  appealsPrompt?: string; // New field
  appealsChannelId?: string;
  ticketsCategoryId?: string;
}

export interface Escalation {
  id: number;
  name?: string;
  threshold: number;
  action: 'mute' | 'kick' | 'ban';
  duration?: number;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface Preset {
  id: number;
  name: string;
  points: number;
}

export interface SettingsBundleResponse {
  settings?: Settings;
  presets?: Preset[];
  escalations?: Escalation[];
  roles?: SelectOption[];
  channels?: SelectOption[];
}

export const settingsApi = {
  getBundle: () => api.get<SettingsBundleResponse>('/settings/bundle').then((res) => res.data),
  
  updateSettings: (settings: Settings) => api.post('/settings', settings),
  
  createPreset: (name: string, points: number) => 
    api.post('/presets', { name, points }),
    
  deletePreset: (id: number) => 
    api.delete(`/presets/${id}`),
    
  createEscalation: (data: Omit<Escalation, 'id'>) => 
    api.post('/escalations', data),
    
  deleteEscalation: (id: number) => 
    api.delete(`/escalations/${id}`),
};
