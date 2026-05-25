# Ambulance Tracker

Real-time emergency response system — ambulance dispatch, live GPS tracking, in-app navigation, and SOS alerts.

**GitHub:** https://github.com/SANJEEV-1208/Ambulance_Tracker  
**Live Admin Dashboard:** https://ambulance-tracker-wxpb.onrender.com/admin

---

## Try It (No Install Required)

Open the **Admin Dashboard** in any browser:  
**https://ambulance-tracker-wxpb.onrender.com/admin**

- See all on-duty ambulances on a live map
- Real-time location updates as drivers move
- On-duty count and last-seen timestamps

> The backend is hosted on Render's free tier — if the page loads slowly the first time, wait ~15 seconds for it to wake up.

---

## Features

- **Live GPS tracking** — Drivers broadcast location every 5 seconds via WebSocket; emergency responders see markers update in real time
- **Nearby hospitals** — Driver dashboard fetches hospitals from OpenStreetMap (Nominatim) for any location worldwide, sorted by road distance
- **In-app navigation** — OSRM calculates the actual road route; polyline drawn on the Leaflet map (no Google Maps dependency)
- **Accurate ETA** — Road distance and driving duration from OSRM instead of straight-line Haversine
- **SOS alerts** — Emergency responders can broadcast their GPS coordinates; all on-duty drivers receive a full-screen alert
- **Admin dashboard** — Web-based live map with real-time ambulance positions and driver stats

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Expo (React Native), TypeScript, EAS Build |
| Maps | Leaflet.js inside WebView (OpenStreetMap tiles, no API key) |
| Routing | OSRM (Open Source Routing Machine) — free, no key |
| Hospital data | Nominatim (OpenStreetMap) — called on-device |
| Real-time | Socket.io v4 (WebSockets) |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL + PostGIS (spatial queries) |
| Auth | JWT + bcrypt |
| Hosting | Render (backend) + Supabase (database) |

---

## Architecture

```
mobile/        Expo React Native app (Android APK via EAS Build)
backend/       Express + Socket.io REST API + WebSocket server
```

**Two roles:**

- **Emergency Responder** — No login. Opens app → sees nearby on-duty ambulances on a map → taps marker → calls driver or sends SOS alert
- **Ambulance Driver** — Registers and logs in. Toggles On Duty. While on duty, GPS is sent to the server every 5 s via WebSocket. Can see nearby hospitals, get road directions, and receive SOS alerts

---

## Local Setup

### Prerequisites
- Node.js ≥ 18
- PostgreSQL ≥ 14 with PostGIS extension
- Expo Go app on a physical Android/iOS device (for local testing)

### 1. Database

```bash
psql -U postgres -c "CREATE DATABASE ambulance_tracker;"
psql -U postgres ambulance_tracker -c "CREATE EXTENSION postgis;"
psql -U postgres ambulance_tracker -f backend/src/db/schema.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL and JWT_SECRET in .env
npm install
npm run dev
# Server starts on port 3000
```

### 3. Mobile

```bash
cd mobile
npm install
npx expo start
# Scan QR code with Expo Go on your phone
```

Update `mobile/constants/config.ts` with your machine's local IP address before scanning.

---

## API Reference

### Auth
| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/auth/register` | `{name, email, phone, password, vehicle_number}` |
| POST | `/api/auth/login` | `{email, password}` |

### Ambulances
| Method | Endpoint | Params |
|--------|----------|--------|
| GET | `/api/ambulances/nearby` | `lat, lng, radius` (metres) |
| GET | `/api/ambulances/active` | — |

### Route
| Method | Endpoint | Params |
|--------|----------|--------|
| GET | `/api/route` | `fromLat, fromLng, toLat, toLng` |

### WebSocket Events

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `driver:on_duty` | — |
| Client → Server | `driver:off_duty` | — |
| Client → Server | `driver:update_location` | `{latitude, longitude}` |
| Client → Server | `user:sos` | `{latitude, longitude}` |
| Server → All | `ambulance:location_updated` | `{driverId, latitude, longitude, timestamp}` |
| Server → All | `ambulance:on_duty` | `{driverId, name, phone, vehicle_number}` |
| Server → All | `ambulance:off_duty` | `{driverId}` |
| Server → All | `sos:alert` | `{latitude, longitude, timestamp}` |
