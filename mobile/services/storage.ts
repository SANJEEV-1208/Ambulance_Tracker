import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppRole, Driver } from '../types';

const KEYS = {
  ROLE: '@ambulance_tracker/role',
  TOKEN: '@ambulance_tracker/token',
  DRIVER: '@ambulance_tracker/driver',
} as const;

export const StorageService = {
  async setRole(role: AppRole): Promise<void> {
    await AsyncStorage.setItem(KEYS.ROLE, role);
  },

  async getRole(): Promise<AppRole | null> {
    const value = await AsyncStorage.getItem(KEYS.ROLE);
    return value as AppRole | null;
  },

  async setToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.TOKEN, token);
  },

  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.TOKEN);
  },

  async setDriver(driver: Driver): Promise<void> {
    await AsyncStorage.setItem(KEYS.DRIVER, JSON.stringify(driver));
  },

  async getDriver(): Promise<Driver | null> {
    const value = await AsyncStorage.getItem(KEYS.DRIVER);
    return value ? (JSON.parse(value) as Driver) : null;
  },

  async clearAuth(): Promise<void> {
    await AsyncStorage.multiRemove([KEYS.TOKEN, KEYS.DRIVER]);
  },

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove([KEYS.ROLE, KEYS.TOKEN, KEYS.DRIVER]);
  },
};
