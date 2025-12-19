import api from './client';
import { User, Warning } from '../types';

export interface Guild {
  id: string;
  name: string;
  icon: string;
  owner: boolean;
}

export interface Preset {
  id: number;
  name: string;
  points: number;
}

export const usersApi = {
  getAll: () => api.get<User[]>('/users').then((res) => res.data),
  
  getWarnings: (userId: string) => 
    api.get<{ warnings: Warning[] }>(`/users/${userId}/warnings`).then((res) => res.data),
    
  getUserGuilds: (userId: string) => 
    api.get<Guild[]>(`/user/${userId}/guilds`).then((res) => res.data),
    
  warn: (userId: string, points: number, reason: string) => 
    api.post('/warn', { userId, points, reason }),
    
  clear: (userId: string) => 
    api.post('/clear', { userId }),
    
  sendVerification: (userId: string) => 
    api.post('/verify/send-dm', { userId }),
    
  getPresets: () => 
    api.get<Preset[]>('/presets').then((res) => res.data),
};
