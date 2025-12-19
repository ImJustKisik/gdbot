import api from './client';

interface AuthUser {
  id: string;
  username: string;
  avatar: string;
  isAdmin: boolean;
}

interface AuthStatusResponse {
  authenticated: boolean;
  user: AuthUser | null;
}

export const authApi = {
  getMe: () => api.get<AuthStatusResponse>('/auth/me').then((res) => res.data),
  logout: () => api.post('/auth/logout'),
  login: () => { window.location.href = '/api/auth/login'; }
};
