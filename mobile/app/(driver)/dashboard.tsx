import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Switch,
  SafeAreaView,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AuthAPI } from '../../services/api';
import { socketService } from '../../services/socket';
import { StorageService } from '../../services/storage';
import { LOCATION_UPDATE_INTERVAL_MS, OSM_TILE_URL } from '../../constants/config';
import { API_BASE_URL } from '../../constants/config';
import type { Driver } from '../../types';

interface Hospital {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance_metres: number;
}

const getMapHTML = (tileUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f1faee; }
    #map { height: 100vh; width: 100vw; }
    .hospital-marker {
      background: #2DC653; width: 36px; height: 36px; border-radius: 50%;
      border: 2px solid white; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(45,198,83,0.5);
      color: white; font-size: 14px; font-weight: bold; text-align: center; line-height: 34px;
    }
    .driver-dot {
      background: #4285F4; width: 16px; height: 16px; border-radius: 50%;
      border: 3px solid white; box-shadow: 0 2px 6px rgba(66,133,244,0.5);
    }
    @keyframes sosPulse { 0%{transform:scale(1);opacity:0.8} 100%{transform:scale(2.4);opacity:0} }
    .sos-pulse { position:absolute; width:36px; height:36px; border-radius:50%; background:rgba(230,57,70,0.4); animation:sosPulse 1.2s ease-out infinite; }
    .sos-core { background:#E63946; color:#fff; font-size:9px; font-weight:900; width:26px; height:26px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; z-index:1; }
    .sos-wrap { position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center; }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { center: [20.5937, 78.9629], zoom: 13, zoomControl: true });
  L.tileLayer('${tileUrl}', { attribution: '© OpenStreetMap © CARTO', maxZoom: 19 }).addTo(map);

  var hospitalMarkers = {};
  var driverMarker = null;

  function updateHospitals(list) {
    Object.values(hospitalMarkers).forEach(function(m) { map.removeLayer(m); });
    hospitalMarkers = {};
    list.forEach(function(h, index) {
      var icon = L.divIcon({
        className: '',
        html: '<div class="hospital-marker">' + (index + 1) + '</div>',
        iconSize: [36, 36], iconAnchor: [18, 18]
      });
      var m = L.marker([h.latitude, h.longitude], { icon: icon });
      m.on('click', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'hospitalClick', id: h.id }));
      });
      m.addTo(map);
      hospitalMarkers[h.id] = m;
    });
  }

  var routeLayer = null;
  function drawRoute(latlngs) {
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.polyline(latlngs, { color: '#2DC653', weight: 5, opacity: 0.85, dashArray: '10, 8' }).addTo(map);
  }
  function clearRoute() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  }

  function setDriverLocation(lat, lng) {
    if (driverMarker) map.removeLayer(driverMarker);
    driverMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: '', html: '<div class="driver-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
    }).addTo(map);
    map.setView([lat, lng], 14);
  }

  function panToDriver() {
    if (driverMarker) map.setView(driverMarker.getLatLng(), 14);
  }

  var sosMarker = null;
  function addSosMarker(lat, lng) {
    if (sosMarker) map.removeLayer(sosMarker);
    var icon = L.divIcon({
      className: '',
      html: '<div class="sos-wrap"><div class="sos-pulse"></div><div class="sos-core">SOS</div></div>',
      iconSize: [36, 36], iconAnchor: [18, 18]
    });
    sosMarker = L.marker([lat, lng], { icon: icon }).addTo(map);
    sosMarker.bindTooltip('Emergency SOS Location', { permanent: true, direction: 'top' });
  }
  function clearSosMarker() {
    if (sosMarker) { map.removeLayer(sosMarker); sosMarker = null; }
  }
</script>
</body>
</html>
`;

export default function DriverDashboard() {
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapReadyRef = useRef(false);
  const hospitalsRef = useRef<Hospital[]>([]);
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSosRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const driverIdRef = useRef<string | null>(null);

  const [driver, setDriver] = useState<Driver | null>(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [hospitalRoute, setHospitalRoute] = useState<{ distance_metres: number; duration_seconds: number } | null>(null);
  const [routeCoords, setRouteCoords] = useState<number[][] | null>(null);
  const [fetchingRoute, setFetchingRoute] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showList, setShowList] = useState(false);
  const [sosAlert, setSosAlert] = useState<{ sosId: string; latitude: number; longitude: number; timestamp: string } | null>(null);
  const [sosNavigating, setSosNavigating] = useState(false);

  const injectHospitals = useCallback((list: Hospital[]) => {
    webViewRef.current?.injectJavaScript(`updateHospitals(${JSON.stringify(list)}); true;`);
  }, []);

  const fetchHospitals = useCallback(async (lat: number, lng: number) => {
    try {
      const offset = 0.135; // ~15km in degrees
      const viewbox = `${lng - offset},${lat + offset},${lng + offset},${lat - offset}`;
      const url = `https://nominatim.openstreetmap.org/search?amenity=hospital&format=json&limit=50&viewbox=${viewbox}&bounded=1&addressdetails=0`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'AmbulanceTracker/1.0',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) throw new Error(`Nominatim ${response.status}`);
      const data = await response.json() as any[];

      const list: Hospital[] = data
        .filter((el) => el.lat && el.lon)
        .map((el) => {
          const hLat = parseFloat(el.lat);
          const hLng = parseFloat(el.lon);
          const dLat = ((hLat - lat) * Math.PI) / 180;
          const dLng = ((hLng - lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat * Math.PI) / 180) * Math.cos((hLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
          const dist = Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
          return {
            id: String(el.place_id),
            name: el.name || el.display_name.split(',')[0] || 'Hospital',
            latitude: hLat,
            longitude: hLng,
            distance_metres: dist,
          };
        })
        .sort((a, b) => a.distance_metres - b.distance_metres);

      setHospitals(list);
      hospitalsRef.current = list;
      injectHospitals(list);
    } catch (err: any) {
      Alert.alert('Error', 'Could not load nearby hospitals. Check your internet connection.');
    }
  }, [injectHospitals]);

  useEffect(() => {
    (async () => {
      try {
        const cached = await StorageService.getDriver();
        if (cached) { setDriver(cached); driverIdRef.current = cached.id; }
        const { driver: fresh } = await AuthAPI.me();
        setDriver(fresh);
        driverIdRef.current = fresh.id;
        await StorageService.setDriver(fresh);
        setIsOnDuty(fresh.is_on_duty);
      } catch (err: any) {
        if (err.message?.includes('401') || err.message?.includes('token')) {
          handleLogout();
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const token = await StorageService.getToken();
      if (token) socketService.connect(token);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude } = loc.coords;
        locationRef.current = { lat: latitude, lng: longitude };
        if (mapReadyRef.current) {
          webViewRef.current?.injectJavaScript(`setDriverLocation(${latitude}, ${longitude}); true;`);
        }
        fetchHospitals(latitude, longitude);
      }

      const socket = socketService.get();
      socket?.on('sos:alert', (data: { sosId: string; latitude: number; longitude: number; timestamp: string }) => {
        setSosAlert(data);
        webViewRef.current?.injectJavaScript(`addSosMarker(${data.latitude}, ${data.longitude}); true;`);
      });

      socket?.on('sos:accepted', (data: { sosId: string; driverId: string }) => {
        const isMe = pendingSosRef.current !== null && data.driverId === driverIdRef.current;
        if (isMe) {
          const { latitude, longitude } = pendingSosRef.current!;
          pendingSosRef.current = null;
          setSosAlert(null);
          handleSosNavigate(latitude, longitude);
        } else {
          pendingSosRef.current = null;
          setSosAlert(null);
          setSosNavigating(false);
          webViewRef.current?.injectJavaScript('clearSosMarker(); true;');
        }
      });
    })();

    return () => {
      stopLocationSharing();
      socketService.get()?.off('sos:alert');
      socketService.get()?.off('sos:accepted');
      socketService.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isOnDuty) startLocationSharing();
    else stopLocationSharing();
    return () => stopLocationSharing();
  }, [isOnDuty]);

  const startLocationSharing = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setIsOnDuty(false); return; }

    const sendLocation = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const { latitude, longitude } = loc.coords;
        locationRef.current = { lat: latitude, lng: longitude };
        if (mapReadyRef.current) {
          webViewRef.current?.injectJavaScript(`setDriverLocation(${latitude}, ${longitude}); true;`);
        }
        socketService.get()?.emit('driver:update_location', { latitude, longitude });
      } catch (err) {
        console.warn('Failed to get location:', err);
      }
    };

    await sendLocation();
    locationInterval.current = setInterval(sendLocation, LOCATION_UPDATE_INTERVAL_MS);
  }, []);

  const stopLocationSharing = useCallback(() => {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
  }, []);

  async function toggleDuty(value: boolean) {
    setToggling(true);
    const socket = socketService.get();
    if (value) { socket?.emit('driver:on_duty'); setIsOnDuty(true); }
    else { socket?.emit('driver:off_duty'); setIsOnDuty(false); }
    setToggling(false);
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'You will be signed out and set to off duty.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => {
          socketService.get()?.emit('driver:off_duty');
          socketService.disconnect();
          await StorageService.clearAuth();
          router.replace('/(driver)/login');
        },
      },
    ]);
  }

  async function handleChangeRole() {
    Alert.alert('Switch Role', 'This will log you out and reset your role. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Switch', style: 'destructive',
        onPress: async () => {
          socketService.get()?.emit('driver:off_duty');
          socketService.disconnect();
          await StorageService.clearAll();
          router.replace('/role-select');
        },
      },
    ]);
  }

  function handleMapLoaded() {
    mapReadyRef.current = true;
    if (locationRef.current) {
      const { lat, lng } = locationRef.current;
      webViewRef.current?.injectJavaScript(`setDriverLocation(${lat}, ${lng}); true;`);
    }
    if (hospitalsRef.current.length > 0) injectHospitals(hospitalsRef.current);
  }

  function handleMapMessage(event: any) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'hospitalClick') {
        const h = hospitalsRef.current.find((x) => x.id === data.id);
        if (h) {
          setSelectedHospital(h);
          setHospitalRoute(null);
          if (locationRef.current) {
            const { lat, lng } = locationRef.current;
            setFetchingRoute(true);
            fetch(`${API_BASE_URL}/api/route?fromLat=${lat}&fromLng=${lng}&toLat=${h.latitude}&toLng=${h.longitude}`)
              .then((r) => r.json())
              .then((d) => {
                if (d.distance_metres) {
                  setHospitalRoute({ distance_metres: d.distance_metres, duration_seconds: d.duration_seconds });
                  setRouteCoords(d.coordinates ?? null);
                }
              })
              .catch(() => {})
              .finally(() => setFetchingRoute(false));
          }
        }
      }
    } catch (_) {}
  }

  function handleNavigate() {
    if (!routeCoords) {
      Alert.alert('Route unavailable', 'Road route is still loading. Please try again in a moment.');
      return;
    }
    const latlngs = routeCoords.map((c) => [c[1], c[0]]);
    webViewRef.current?.injectJavaScript(`drawRoute(${JSON.stringify(latlngs)}); true;`);
    setSelectedHospital(null);
    setIsNavigating(true);
  }

  function handleStopNavigation() {
    webViewRef.current?.injectJavaScript('clearRoute(); clearSosMarker(); true;');
    setIsNavigating(false);
    setRouteCoords(null);
    setHospitalRoute(null);
  }

  async function handleSosNavigate(toLat: number, toLng: number) {
    if (!locationRef.current) return;
    setSosNavigating(true);
    try {
      const { lat, lng } = locationRef.current;
      const res = await fetch(
        `${API_BASE_URL}/api/route?fromLat=${lat}&fromLng=${lng}&toLat=${toLat}&toLng=${toLng}`
      );
      const data = await res.json();
      if (!data.coordinates?.length) throw new Error('No route');
      const latlngs = data.coordinates.map((c: number[]) => [c[1], c[0]]);
      webViewRef.current?.injectJavaScript(`drawRoute(${JSON.stringify(latlngs)}); true;`);
      setIsNavigating(true);
    } catch {
      Alert.alert('Route unavailable', 'Could not fetch route. Check your internet connection.');
    } finally {
      setSosNavigating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E63946" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        style={styles.map}
        source={{ html: getMapHTML(OSM_TILE_URL) }}
        onLoad={handleMapLoaded}
        onMessage={handleMapMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
      />

      {/* Top overlay */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.topBarContent}>
          <View style={[styles.statusBadge, isOnDuty ? styles.statusBadgeOn : styles.statusBadgeOff]}>
            <View style={[styles.statusDot, { backgroundColor: isOnDuty ? '#2DC653' : '#ADB5BD' }]} />
            <Text style={[styles.statusText, { color: isOnDuty ? '#2DC653' : '#ADB5BD' }]}>
              {isOnDuty ? 'On Duty' : 'Off Duty'}
            </Text>
            {toggling ? (
              <ActivityIndicator size="small" color={isOnDuty ? '#2DC653' : '#ADB5BD'} style={{ marginLeft: 4 }} />
            ) : (
              <Switch
                value={isOnDuty}
                onValueChange={toggleDuty}
                trackColor={{ false: '#DEE2E6', true: '#2DC653' }}
                thumbColor="#fff"
                ios_backgroundColor="#DEE2E6"
                style={{ marginLeft: 8, transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            )}
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowProfile(true)}>
            <Ionicons name="person-circle-outline" size={22} color="#1D3557" />
          </TouchableOpacity>
        </View>
        {hospitals.length > 0 && (
          <View style={styles.hospitalBadge}>
            <Ionicons name="business" size={12} color="#2DC653" />
            <Text style={styles.hospitalBadgeText}>
              {hospitals.length} hospital{hospitals.length !== 1 ? 's' : ''} nearby
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* Locate button */}
      <TouchableOpacity
        style={styles.locateBtn}
        onPress={() => { webViewRef.current?.injectJavaScript('panToDriver(); true;'); }}
      >
        <Ionicons name="locate" size={22} color="#1D3557" />
      </TouchableOpacity>

      {/* Stop navigation button */}
      {isNavigating && (
        <TouchableOpacity style={styles.stopNavBtn} onPress={handleStopNavigation}>
          <Ionicons name="close-circle" size={18} color="#fff" />
          <Text style={styles.stopNavText}>Stop Navigation</Text>
        </TouchableOpacity>
      )}

      {/* Hospital list button */}
      {hospitals.length > 0 && (
        <TouchableOpacity style={styles.listBtn} onPress={() => setShowList(true)}>
          <Ionicons name="list" size={22} color="#1D3557" />
        </TouchableOpacity>
      )}

      {/* SOS Alert Modal */}
      <Modal visible={!!sosAlert} transparent animationType="fade" onRequestClose={() => setSosAlert(null)}>
        <View style={styles.sosOverlay}>
          <View style={styles.sosCard}>
            <View style={styles.sosIconRow}>
              <Ionicons name="warning" size={40} color="#E63946" />
            </View>
            <Text style={styles.sosTitle}>EMERGENCY SOS</Text>
            <Text style={styles.sosSubtitle}>A nearby user needs urgent help!</Text>
            {sosAlert && (
              <Text style={styles.sosCoords}>
                {sosAlert.latitude.toFixed(5)}, {sosAlert.longitude.toFixed(5)}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.sosAcceptBtn, sosNavigating && { opacity: 0.7 }]}
              onPress={() => {
                if (sosAlert) {
                  pendingSosRef.current = { latitude: sosAlert.latitude, longitude: sosAlert.longitude };
                  socketService.get()?.emit('sos:accept', { sosId: sosAlert.sosId });
                  setSosNavigating(true);
                }
              }}
              disabled={sosNavigating}
            >
              {sosNavigating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
              <Text style={styles.sosNavigateText}>
                {sosNavigating ? 'Accepting…' : 'Accept & Navigate'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sosDismissBtn} onPress={() => setSosAlert(null)} disabled={sosNavigating}>
              <Text style={styles.sosDismissText}>Deny</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Hospital bottom sheet */}
      <Modal
        visible={!!selectedHospital}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedHospital(null)}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSelectedHospital(null)} />
        {selectedHospital && (
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="business" size={28} color="#2DC653" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetName}>{selectedHospital.name}</Text>
                <Text style={styles.sheetSub}>Hospital</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedHospital(null)}>
                <Ionicons name="close-circle" size={28} color="#ADB5BD" />
              </TouchableOpacity>
            </View>
            <View style={styles.sheetRow}>
              <Ionicons name="navigate" size={16} color="#457B9D" />
              {fetchingRoute ? (
                <ActivityIndicator size="small" color="#457B9D" style={{ marginLeft: 4 }} />
              ) : hospitalRoute ? (
                <>
                  <Text style={styles.sheetDetail}>
                    {hospitalRoute.distance_metres < 1000
                      ? `${hospitalRoute.distance_metres} m`
                      : `${(hospitalRoute.distance_metres / 1000).toFixed(1)} km`} by road
                  </Text>
                  <Text style={styles.etaChip}>
                    ~{Math.ceil(hospitalRoute.duration_seconds / 60)} min
                  </Text>
                </>
              ) : (
                <Text style={styles.sheetDetail}>
                  {selectedHospital.distance_metres < 1000
                    ? `${selectedHospital.distance_metres} m`
                    : `${(selectedHospital.distance_metres / 1000).toFixed(1)} km`} (straight-line)
                </Text>
              )}
            </View>
            <TouchableOpacity style={[styles.navigateBtn, !routeCoords && { opacity: 0.6 }]} onPress={handleNavigate}>
              <Ionicons name="navigate" size={22} color="#fff" />
              <Text style={styles.navigateBtnText}>Navigate</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>

      {/* Hospital list modal */}
      <Modal visible={showList} transparent animationType="slide" onRequestClose={() => setShowList(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowList(false)} />
        <View style={styles.listSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.profileTitle}>Nearby Hospitals</Text>
          <Text style={styles.listSubtitle}>Sorted by distance from your location</Text>
          {hospitals.map((h, index) => {
            const label = h.distance_metres < 1000
              ? `${h.distance_metres} m`
              : `${(h.distance_metres / 1000).toFixed(1)} km`;
            return (
              <TouchableOpacity
                key={h.id}
                style={styles.listItem}
                onPress={() => { setShowList(false); setSelectedHospital(h); }}
              >
                <View style={styles.listRank}>
                  <Text style={styles.listRankText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listName}>{h.name}</Text>
                  <Text style={styles.listDist}>{label} away</Text>
                </View>
                <TouchableOpacity onPress={() => { setShowList(false); setSelectedHospital(h); }}>
                  <Ionicons name="navigate" size={22} color="#2DC653" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>

      {/* Profile bottom sheet */}
      <Modal
        visible={showProfile}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProfile(false)}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowProfile(false)} />
        <View style={styles.profileSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.profileTitle}>Driver Profile</Text>
          {driver && (
            <>
              <ProfileRow icon="person" label="Name" value={driver.name} />
              <ProfileRow icon="mail" label="Email" value={driver.email} />
              <ProfileRow icon="call" label="Phone" value={driver.phone} />
              <ProfileRow icon="car" label="Vehicle" value={driver.vehicle_number} />
            </>
          )}
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => { setShowProfile(false); handleLogout(); }}
          >
            <Ionicons name="log-out-outline" size={18} color="#E63946" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.switchRoleBtn}
            onPress={() => { setShowProfile(false); handleChangeRole(); }}
          >
            <Ionicons name="swap-horizontal" size={16} color="#457B9D" />
            <Text style={styles.switchRoleText}>Switch to User mode</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function ProfileRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={profileRowStyles.row}>
      <Ionicons name={icon as any} size={16} color="#457B9D" style={{ width: 20 }} />
      <Text style={profileRowStyles.label}>{label}</Text>
      <Text style={profileRowStyles.value}>{value}</Text>
    </View>
  );
}

const profileRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F1FAEE', gap: 8,
  },
  label: { width: 64, fontSize: 13, color: '#457B9D', fontWeight: '600' },
  value: { flex: 1, fontSize: 15, color: '#1D3557' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1FAEE' },
  map: { ...StyleSheet.absoluteFillObject },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarContent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    margin: 16, marginTop: Platform.OS === 'android' ? 40 : 12,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, gap: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  statusBadgeOn: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#2DC653' },
  statusBadgeOff: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DEE2E6' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },
  iconBtn: {
    backgroundColor: '#fff', width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  hospitalBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6,
    marginLeft: 16, alignSelf: 'flex-start',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  hospitalBadgeText: { fontSize: 12, fontWeight: '600', color: '#1D3557' },
  locateBtn: {
    position: 'absolute', bottom: 32, right: 16, backgroundColor: '#fff',
    width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 16, elevation: 10,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: '#DEE2E6', borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  sheetIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#F0FDF4',
    justifyContent: 'center', alignItems: 'center',
  },
  sheetName: { fontSize: 18, fontWeight: '700', color: '#1D3557' },
  sheetSub: { fontSize: 13, color: '#457B9D', marginTop: 2 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sheetDetail: { fontSize: 15, color: '#1D3557' },
  etaChip: { marginLeft: 'auto' as any, fontSize: 13, fontWeight: '700', color: '#2DC653' },
  navigateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2DC653', borderRadius: 14, paddingVertical: 16, marginTop: 12, gap: 10,
  },
  navigateBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  profileSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  profileTitle: { fontSize: 18, fontWeight: '700', color: '#1D3557', marginBottom: 12 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF0F1', borderRadius: 14, paddingVertical: 14, gap: 8, marginTop: 20,
    borderWidth: 1.5, borderColor: '#FFCCD0',
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#E63946' },
  switchRoleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, marginTop: 4,
  },
  switchRoleText: { fontSize: 14, color: '#457B9D' },
  sosOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sosCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 28,
    width: '100%', alignItems: 'center',
    borderWidth: 3, borderColor: '#E63946',
  },
  sosIconRow: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFF0F1',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  sosTitle: { fontSize: 26, fontWeight: '900', color: '#E63946', letterSpacing: 2, marginBottom: 8 },
  sosSubtitle: { fontSize: 15, color: '#1D3557', textAlign: 'center', marginBottom: 12 },
  sosCoords: { fontSize: 13, color: '#457B9D', marginBottom: 24 },
  sosAcceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2DC653', borderRadius: 14, paddingVertical: 16,
    width: '100%', gap: 10, marginBottom: 12,
  },
  sosNavigateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E63946', borderRadius: 14, paddingVertical: 16,
    width: '100%', gap: 10, marginBottom: 12,
  },
  sosNavigateText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  sosDismissBtn: { paddingVertical: 10 },
  sosDismissText: { fontSize: 15, color: '#ADB5BD', fontWeight: '600' },
  stopNavBtn: {
    position: 'absolute', bottom: 32, left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E63946', paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 24, shadowColor: '#E63946', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  stopNavText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  listBtn: {
    position: 'absolute', bottom: 90, right: 16, backgroundColor: '#fff',
    width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  listSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, maxHeight: '80%',
  },
  listSubtitle: { fontSize: 12, color: '#457B9D', marginBottom: 16, marginTop: -8 },
  listItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1FAEE',
  },
  listRank: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#2DC653',
    justifyContent: 'center', alignItems: 'center',
  },
  listRankText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  listName: { fontSize: 14, fontWeight: '600', color: '#1D3557' },
  listDist: { fontSize: 12, color: '#457B9D', marginTop: 2 },
});
