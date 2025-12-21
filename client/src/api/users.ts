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

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export const usersApi = {
  // Requesting a large limit to get all users for now, until frontend pagination is implemented
  getAll: () => api.get<PaginatedResponse<User>>('/users?limit=1000').then((res) => res.data.data),
  
  getWarnings: (userId: string) => 
    api.get<{ warnings: Warning[], invite?: User['invite'] }>(`/users/${userId}/warnings`).then((res) => res.data),
    
  getUserGuilds: (userId: string) => 
    api.get<Guild[]>(`/user/${userId}/guilds`).then((res) => res.data),
    
  warn: (userId: string, points: number, reason: string, anonymous: boolean = false) => 
    api.post('/warn', { userId, points, reason, anonymous }),
    
  clear: (userId: string, anonymous: boolean = false) => 
    api.post('/clear', { userId, anonymous }),
    
  sendVerification: (userId: string) => 
    api.post('/verify/send-dm', { userId }),
    
  getPresets: () => 
    api.get<Preset[]>('/presets').then((res) => res.data),
};
