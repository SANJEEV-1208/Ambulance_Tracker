export interface StaticHospital {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export const STATIC_HOSPITALS: StaticHospital[] = [
  { id: 'h1',  name: 'Tambaram Government Hospital',         latitude: 12.9246, longitude: 80.0994 },
  { id: 'h2',  name: 'ESIC Hospital Tambaram',               latitude: 12.9216, longitude: 80.1098 },
  { id: 'h3',  name: 'St. Thomas Hospital Tambaram',         latitude: 12.9231, longitude: 80.0978 },
  { id: 'h4',  name: 'Chromepet Government Hospital',        latitude: 12.9505, longitude: 80.1440 },
  { id: 'h5',  name: 'Pallavaram Government Hospital',       latitude: 12.9672, longitude: 80.1493 },
  { id: 'h6',  name: 'SRM Medical College Hospital',         latitude: 12.8196, longitude: 80.0427 },
  { id: 'h7',  name: 'Chettinad Health City',                latitude: 12.8398, longitude: 80.2203 },
  { id: 'h8',  name: 'Gleneagles Global Hospital',           latitude: 12.9039, longitude: 80.2150 },
  { id: 'h9',  name: 'Sri Ramachandra Medical Centre',       latitude: 13.0358, longitude: 80.1619 },
  { id: 'h10', name: 'Saveetha Medical College Hospital',    latitude: 13.0267, longitude: 80.0485 },
  { id: 'h11', name: 'Apollo Hospitals Greams Road',         latitude: 13.0568, longitude: 80.2427 },
  { id: 'h12', name: 'Fortis Malar Hospital',                latitude: 13.0067, longitude: 80.2613 },
  { id: 'h13', name: 'MIOT International Hospital',          latitude: 13.0156, longitude: 80.1648 },
  { id: 'h14', name: 'Vijaya Hospital Vadapalani',           latitude: 13.0504, longitude: 80.2123 },
  { id: 'h15', name: 'Government Royapettah Hospital',       latitude: 13.0524, longitude: 80.2627 },
];

// Haversine distance in metres between two coordinates
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getNearbyHospitals(lat: number, lng: number, radiusMetres = 15000): StaticHospital[] {
  return STATIC_HOSPITALS.filter(
    (h) => distanceMetres(lat, lng, h.latitude, h.longitude) <= radiusMetres
  );
}
