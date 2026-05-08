import { API_BASE_URL, NEARBY_RADIUS_METERS } from '../constants/config';
import { Ambulance, Driver } from '../types';
import { StorageService } from './storage';

async function request<T>(
  path: string,
  options: RequestInit = {},
  withAuth = false
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (withAuth) {
    const token = await StorageService.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data as T;
}

export const AuthAPI = {
  register(payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    vehicle_number: string;
  }): Promise<{ token: string; driver: Driver }> {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(email: string, password: string): Promise<{ token: string; driver: Driver }> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  me(): Promise<{ driver: Driver }> {
    return request('/api/auth/me', {}, true);
  },
};

export const AmbulanceAPI = {
  getNearby(lat: number, lng: number): Promise<{ ambulances: Ambulance[] }> {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(NEARBY_RADIUS_METERS),
    });
    return request(`/api/ambulances/nearby?${params}`);
  },
};
