import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // You can add global error handling here, e.g., redirect to login on 401
    if (error.response && error.response.status === 401) {
      // Optional: window.location.href = '/api/auth/login';
    }
    return Promise.reject(error);
  }
);

export default api;
