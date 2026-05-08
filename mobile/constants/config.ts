export const API_BASE_URL = 'https://ambulance-tracker-wxpb.onrender.com';

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
