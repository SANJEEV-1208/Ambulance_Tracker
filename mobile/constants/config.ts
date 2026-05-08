import { Platform } from 'react-native';

// Android emulator uses 10.0.2.2 to reach host machine localhost.
// iOS simulator can use localhost directly.
// Physical device: replace with your machine's local IP (e.g. 192.168.1.x).
const LOCAL_IP = '10.165.224.71'; // <-- change to your machine's IP for physical devices

function getBaseUrl(): string {
  if (__DEV__) {
    // LOCAL_IP works for physical devices (Android + iOS) on the same network
    return `http://${LOCAL_IP}:3000`;
  }
  return `https://your-production-server.com`; // replace for production
}

export const API_BASE_URL = getBaseUrl();

// Carto tiles use OSM data but allow app usage without User-Agent restrictions
export const OSM_TILE_URL = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

export const DEFAULT_REGION = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export const LOCATION_UPDATE_INTERVAL_MS = 5000;

export const NEARBY_RADIUS_METERS = 10000; // 10 km
