export type AppRole = 'user' | 'driver';

export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicle_number: string;
  is_on_duty: boolean;
  created_at?: string;
}

export interface Ambulance {
  id: string;
  name: string;
  phone: string;
  vehicle_number: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  last_seen: string;
}

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

// Socket.io event payloads
export interface AmbulanceLocationUpdate {
  driverId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export interface AmbulanceOnDutyEvent {
  driverId: string;
  id: string;
  name: string;
  phone: string;
  vehicle_number: string;
}

export interface AmbulanceOffDutyEvent {
  driverId: string;
}
