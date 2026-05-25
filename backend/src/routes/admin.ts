import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AmbulanceTracker — Admin</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdn.socket.io/4.6.0/socket.io.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; height: 100vh; display: flex; flex-direction: column; }
    header { background: #1e293b; padding: 14px 24px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #334155; }
    .logo { background: #E63946; color: #fff; font-size: 13px; font-weight: 800; padding: 6px 12px; border-radius: 8px; letter-spacing: 1px; }
    header h1 { font-size: 18px; font-weight: 700; color: #f1f5f9; }
    .live-dot { width: 8px; height: 8px; background: #2DC653; border-radius: 50%; animation: pulse 1.5s infinite; margin-left: auto; }
    .live-label { font-size: 12px; color: #2DC653; font-weight: 600; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .layout { display: flex; flex: 1; overflow: hidden; }
    #map { flex: 1; }
    .sidebar { width: 300px; background: #1e293b; border-left: 1px solid #334155; display: flex; flex-direction: column; overflow: hidden; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #334155; border-bottom: 1px solid #334155; }
    .stat { background: #1e293b; padding: 16px; text-align: center; }
    .stat-value { font-size: 32px; font-weight: 800; color: #E63946; }
    .stat-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
    .stat-value.green { color: #2DC653; }
    .list-header { padding: 14px 16px 10px; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #334155; }
    #driver-list { overflow-y: auto; flex: 1; }
    .driver-card { padding: 14px 16px; border-bottom: 1px solid #1a2744; cursor: pointer; transition: background 0.15s; }
    .driver-card:hover { background: #263044; }
    .driver-name { font-size: 14px; font-weight: 600; color: #f1f5f9; }
    .driver-vehicle { font-size: 12px; color: #64748b; margin-top: 2px; }
    .driver-seen { font-size: 11px; color: #2DC653; margin-top: 4px; }
    .driver-seen.stale { color: #f59e0b; }
    .empty { padding: 32px 16px; text-align: center; color: #475569; font-size: 14px; }
    .amb-marker { background:#E63946; width:32px; height:32px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(230,57,70,0.5); }
  </style>
</head>
<body>
<header>
  <span class="logo">🚑 ADMIN</span>
  <h1>AmbulanceTracker Dashboard</h1>
  <span class="live-dot"></span>
  <span class="live-label">LIVE</span>
</header>
<div class="layout">
  <div id="map"></div>
  <div class="sidebar">
    <div class="stats">
      <div class="stat"><div class="stat-value green" id="onduty-count">0</div><div class="stat-label">On Duty</div></div>
      <div class="stat"><div class="stat-value" id="total-count">0</div><div class="stat-label">Registered</div></div>
    </div>
    <div class="list-header">Active Ambulances</div>
    <div id="driver-list"><div class="empty">No ambulances on duty</div></div>
  </div>
</div>
<script>
  var map = L.map('map', { center: [20.5937, 78.9629], zoom: 5 });
  L.tileLayer('https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap © CARTO', maxZoom: 19
  }).addTo(map);

  var markers = {};
  var ambulances = {};

  var ambIcon = L.divIcon({
    className: '',
    html: '<div class="amb-marker"><svg viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z"/></svg></div>',
    iconSize: [32, 32], iconAnchor: [16, 32]
  });

  function timeAgo(isoString) {
    var seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (seconds < 60) return seconds + 's ago';
    return Math.floor(seconds / 60) + 'min ago';
  }

  function isStale(isoString) {
    return (Date.now() - new Date(isoString).getTime()) > 120000;
  }

  function renderList() {
    var list = Object.values(ambulances);
    var el = document.getElementById('driver-list');
    document.getElementById('onduty-count').textContent = list.length;
    if (!list.length) { el.innerHTML = '<div class="empty">No ambulances on duty</div>'; return; }
    el.innerHTML = list.map(function(a) {
      var stale = a.last_seen && isStale(a.last_seen);
      return '<div class="driver-card" onclick="focusAmbulance(\\''+a.id+'\\')">'+
        '<div class="driver-name">'+a.name+'</div>'+
        '<div class="driver-vehicle">'+a.vehicle_number+' &bull; '+a.phone+'</div>'+
        (a.last_seen ? '<div class="driver-seen'+(stale?' stale':'')+'">'+timeAgo(a.last_seen)+'</div>' : '')+
        '</div>';
    }).join('');
  }

  function addOrUpdateMarker(a) {
    if (!a.latitude || !a.longitude) return;
    if (markers[a.id]) map.removeLayer(markers[a.id]);
    var m = L.marker([a.latitude, a.longitude], { icon: ambIcon });
    m.bindTooltip(a.name + ' · ' + a.vehicle_number, { permanent: false });
    m.addTo(map);
    markers[a.id] = m;
  }

  function focusAmbulance(id) {
    if (markers[id]) map.setView(markers[id].getLatLng(), 15);
  }

  // Initial load
  fetch('/api/ambulances/active')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      document.getElementById('total-count').textContent = data.total_drivers || 0;
      (data.ambulances || []).forEach(function(a) {
        ambulances[a.id] = a;
        addOrUpdateMarker(a);
      });
      renderList();
      if (data.ambulances && data.ambulances.length > 0) {
        var first = data.ambulances[0];
        map.setView([first.latitude, first.longitude], 13);
      }
    })
    .catch(function() {});

  // Real-time via Socket.io
  var socket = io();
  socket.on('ambulance:location_updated', function(d) {
    if (ambulances[d.driverId]) {
      ambulances[d.driverId].latitude = d.latitude;
      ambulances[d.driverId].longitude = d.longitude;
      ambulances[d.driverId].last_seen = d.timestamp;
      addOrUpdateMarker(ambulances[d.driverId]);
      renderList();
    }
  });
  socket.on('ambulance:on_duty', function(d) {
    ambulances[d.driverId] = { id: d.driverId, name: d.name, phone: d.phone, vehicle_number: d.vehicle_number, latitude: 0, longitude: 0, last_seen: null };
    renderList();
  });
  socket.on('ambulance:off_duty', function(d) {
    if (markers[d.driverId]) { map.removeLayer(markers[d.driverId]); delete markers[d.driverId]; }
    delete ambulances[d.driverId];
    renderList();
  });

  // Refresh time-ago labels every 30s
  setInterval(renderList, 30000);
</script>
</body>
</html>`);
});

export default router;
