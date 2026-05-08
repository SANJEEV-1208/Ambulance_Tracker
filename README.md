# AmbulanceTracker

Real-time ambulance location sharing app built with Expo React Native, Express, PostgreSQL/PostGIS, and Socket.io.

## Architecture

```
ambulance-tracker/
├── backend/          Express + Socket.io + PostGIS
└── mobile/           Expo React Native (Expo Router)
```

**Role model:**
- **User (Emergency Responder)** — No login. Opens app → sees nearby on-duty ambulances on OpenStreetMap → taps marker → sees driver phone number → calls directly.
- **Driver** — Registers/logs in. Toggles duty status. When on duty, sends live GPS every 5 seconds via WebSocket.

---

## Prerequisites

- Node.js ≥ 18
- PostgreSQL ≥ 14 with PostGIS extension
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (macOS) or Android Emulator / physical device

---

## 1. Database Setup

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE ambulance_tracker;"

# Enable PostGIS (must be superuser)
psql -U postgres ambulance_tracker -c "CREATE EXTENSION postgis;"

# Run schema
psql -U postgres ambulance_tracker -f backend/src/db/schema.sql
```

---

## 2. Backend Setup

```bash
cd backend

# Copy environment file
cp .env.example .env

# Edit .env — set your DATABASE_URL and a strong JWT_SECRET
# Example:
#   DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/ambulance_tracker
#   JWT_SECRET=some_long_random_string_here_change_me

# Install dependencies
npm install

# Start development server
npm run dev
```

The server starts on **port 3000** by default.

Verify: `curl http://localhost:3000/health` → `{"status":"ok"}`

---

## 3. Mobile App Setup

### Configure the API URL

Edit `mobile/constants/config.ts`:

| Scenario | URL to use |
|---|---|
| Android Emulator | `http://10.0.2.2:3000` (already default) |
| iOS Simulator | `http://localhost:3000` (already default) |
| Physical device | Replace `LOCAL_IP` with your machine's local IP, e.g. `http://192.168.1.100:3000` |

Find your local IP:
- Windows: `ipconfig` → look for IPv4 Address
- macOS/Linux: `ifconfig` or `ip addr`

### Install and run

```bash
cd mobile

npm install

# iOS Simulator (macOS only)
npm run ios

# Android Emulator
npm run android

# Expo Go (scan QR code — use physical device IP in config.ts)
npm start
```

---

## 4. Using the App

### First Launch
1. Select your role: **Emergency Responder** or **Ambulance Driver**
2. Role is saved permanently (change via Settings icon or "Switch Role" button)

### User Mode (Emergency Responder)
- No login required
- Map opens immediately showing your location
- Red markers = on-duty ambulances within 10 km
- Tap any marker → view driver name, vehicle number, distance
- Tap **Call Driver** → opens phone dialer

### Driver Mode
1. Register with name, email, phone, vehicle number, password
2. Log in
3. Dashboard: toggle **On Duty** switch
4. While on duty: GPS sent to server every 5 seconds via WebSocket
5. Going off duty (or closing the app) removes you from the live map

---

## API Reference

### Auth (driver-only)

| Method | Endpoint | Body | Auth |
|--------|----------|------|------|
| POST | `/api/auth/register` | `{name, email, phone, password, vehicle_number}` | — |
| POST | `/api/auth/login` | `{email, password}` | — |
| GET | `/api/auth/me` | — | Bearer token |

### Ambulances (public)

| Method | Endpoint | Query params |
|--------|----------|--------------|
| GET | `/api/ambulances/nearby` | `lat`, `lng`, `radius` (meters, default 10000) |

### WebSocket Events

**Client → Server (driver only, must send JWT in `auth.token`):**

| Event | Payload |
|-------|---------|
| `driver:on_duty` | — |
| `driver:off_duty` | — |
| `driver:update_location` | `{latitude, longitude}` |

**Server → All clients (broadcast):**

| Event | Payload |
|-------|---------|
| `ambulance:on_duty` | `{driverId, id, name, phone, vehicle_number}` |
| `ambulance:off_duty` | `{driverId}` |
| `ambulance:location_updated` | `{driverId, latitude, longitude, timestamp}` |

---

## Maps

Uses **OpenStreetMap** tiles (free, no API key required) via `react-native-maps` `UrlTile` component with `mapType="none"`. Tile URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`

Please respect the [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) — for production use, self-host tiles with a tool like [tileserver-gl](https://github.com/maptiler/tileserver-gl).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Expo SDK 51, React Native 0.74, TypeScript |
| Navigation | Expo Router v3 (file-based) |
| Maps | react-native-maps + OpenStreetMap UrlTile |
| Location | expo-location |
| Real-time | Socket.io v4 (WebSockets) |
| Backend | Node.js, Express 4, TypeScript |
| Database | PostgreSQL 14+ with PostGIS |
| Auth | JWT (30-day expiry), bcrypt (cost 12) |
| Storage | @react-native-async-storage/async-storage |

---

## Production Notes

- **Background location**: Currently only foreground location is used. For production, add `Location.startLocationUpdatesAsync` with `expo-task-manager` so location continues when the app is backgrounded.
- **OSM tiles**: Self-host for production to avoid rate limits.
- **HTTPS**: Enable TLS on the backend. Socket.io will use `wss://` automatically.
- **JWT Secret**: Use a cryptographically random 256-bit secret.
- **Database**: Add connection pooling (PgBouncer) for high load.
