# RESQUBE — Real-Time Emergency Response App

RESQUBE is an Android app that connects emergency responders with nearby ambulance drivers in real time. Built as my final year project, it handles live GPS tracking, SOS alerts, in-app navigation, and nearby hospital discovery — all without Google Maps or any paid APIs.

**Live Admin Dashboard:** https://ambulance-tracker-wxpb.onrender.com/admin  
**Download APK:** https://expo.dev/artifacts/eas/WTtuwyWAu8CGPtcHNVRjc.apk

> Backend runs on Render's free tier — first load might take ~15 seconds to wake up.

---

## Demo Videos

**Ambulance Driver side** — logging in, going on duty, receiving SOS alerts, navigating to the user  
[Watch on Google Drive](https://drive.google.com/file/d/1mBaN4-p96A9pnOZmhwZZ7Ft1gE-_k5rL/view?usp=drivesdk)

**Emergency Responder side** — seeing nearby ambulances, sending SOS, getting notified when a driver accepts  
[Watch on Google Drive](https://drive.google.com/file/d/1nUy6MGeutNpUmlAf-pqXvXQ5_EqaaaV6/view?usp=drivesdk)

---

## What it does

There are two sides to the app:

**Emergency Responder (no login needed)**
- Opens the app and sees all on-duty ambulances on a live map
- Tap any ambulance marker to call the driver directly
- Hit the SOS button to broadcast your location to all nearby drivers
- Once a driver accepts, you get their name, phone number, and vehicle number

**Ambulance Driver (login required)**
- Toggle on/off duty — location starts broadcasting every 5 seconds via WebSocket
- Receives SOS alerts as a full-screen popup with Accept/Deny options
- First driver to accept gets the job; everyone else's popup is dismissed automatically
- In-app navigation draws the road route to the patient using OSRM
- Can search nearby hospitals sorted by road distance

**Admin Dashboard (web)**
- Live map showing all on-duty ambulances with real-time location updates
- SOS alerts show as pulsing red markers with a toast notification
- Sidebar lists active drivers and incoming SOS events

---

## Tech Stack

| | |
|---|---|
| Mobile | React Native (Expo), TypeScript, EAS Build |
| Maps | Leaflet.js in WebView — OpenStreetMap tiles, no API key |
| Routing | OSRM — free road routing, no key needed |
| Hospital search | Nominatim (OpenStreetMap) |
| Real-time | Socket.io v4 |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL with PostGIS for spatial queries |
| Auth | JWT + bcrypt |
| Hosting | Render (backend), Supabase (database) |

---

## Running locally

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
# fill in DATABASE_URL and JWT_SECRET
npm install
npm run dev
```

### 3. Mobile

```bash
cd mobile
npm install
npx expo start
```

Update `mobile/constants/config.ts` with your local machine's IP before scanning the QR code with Expo Go.

---

## API

| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/auth/register` | `{name, email, phone, password, vehicle_number}` |
| POST | `/api/auth/login` | `{email, password}` |
| GET | `/api/ambulances/nearby` | `?lat=&lng=&radius=` (metres) |
| GET | `/api/ambulances/active` | all on-duty drivers |
| GET | `/api/route` | `?fromLat=&fromLng=&toLat=&toLng=` |
| GET | `/api/hospitals/nearby` | `?lat=&lng=` |

## WebSocket Events

| Who sends it | Event | Payload |
|---|---|---|
| Driver → Server | `driver:on_duty` | — |
| Driver → Server | `driver:off_duty` | — |
| Driver → Server | `driver:update_location` | `{latitude, longitude}` |
| User → Server | `user:sos` | `{latitude, longitude}` |
| Driver → Server | `sos:accept` | `{sosId}` |
| Server → All | `ambulance:location_updated` | `{driverId, latitude, longitude}` |
| Server → All | `ambulance:on_duty` | `{driverId, name, phone, vehicle_number}` |
| Server → All | `ambulance:off_duty` | `{driverId}` |
| Server → All | `sos:alert` | `{sosId, latitude, longitude, timestamp}` |
| Server → All | `sos:accepted` | `{sosId, driverId, driver}` |
