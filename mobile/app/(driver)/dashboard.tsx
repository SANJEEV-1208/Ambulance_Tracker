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
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AuthAPI } from '../../services/api';
import { socketService } from '../../services/socket';
import { StorageService } from '../../services/storage';
import { LOCATION_UPDATE_INTERVAL_MS, OSM_TILE_URL } from '../../constants/config';
import { getNearbyHospitals, distanceMetres } from '../../constants/hospitals';
import type { Driver } from '../../types';

interface Hospital {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
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
      color: white; font-size: 18px; font-weight: bold; text-align: center; line-height: 32px;
    }
    .driver-dot {
      background: #4285F4; width: 16px; height: 16px; border-radius: 50%;
      border: 3px solid white; box-shadow: 0 2px 6px rgba(66,133,244,0.5);
    }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { center: [20.5937, 78.9629], zoom: 13, zoomControl: true });
  L.tileLayer('${tileUrl}', { attribution: '© OpenStreetMap © CARTO', maxZoom: 19 }).addTo(map);

  var hospitalMarkers = {};
  var driverMarker = null;

  var hospitalIcon = L.divIcon({
    className: '',
    html: '<div class="hospital-marker">H</div>',
    iconSize: [36, 36], iconAnchor: [18, 36]
  });

  function updateHospitals(list) {
    Object.values(hospitalMarkers).forEach(function(m) { map.removeLayer(m); });
    hospitalMarkers = {};
    list.forEach(function(h) {
      var m = L.marker([h.latitude, h.longitude], { icon: hospitalIcon });
      m.on('click', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'hospitalClick', id: h.id }));
      });
      m.addTo(map);
      hospitalMarkers[h.id] = m;
    });
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

  const [driver, setDriver] = useState<Driver | null>(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const injectHospitals = useCallback((list: Hospital[]) => {
    webViewRef.current?.injectJavaScript(`updateHospitals(${JSON.stringify(list)}); true;`);
  }, []);

  const fetchHospitals = useCallback((lat: number, lng: number) => {
    const list = getNearbyHospitals(lat, lng);
    setHospitals(list);
    hospitalsRef.current = list;
    injectHospitals(list);
  }, [injectHospitals]);

  useEffect(() => {
    (async () => {
      try {
        const cached = await StorageService.getDriver();
        if (cached) setDriver(cached);
        const { driver: fresh } = await AuthAPI.me();
        setDriver(fresh);
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
    })();

    return () => {
      stopLocationSharing();
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
        if (h) setSelectedHospital(h);
      }
    } catch (_) {}
  }

  function handleNavigate(hospital: Hospital) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${hospital.latitude},${hospital.longitude}&travelmode=driving`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open maps.'));
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
            {locationRef.current && (() => {
              const dist = distanceMetres(locationRef.current!.lat, locationRef.current!.lng, selectedHospital.latitude, selectedHospital.longitude);
              const label = dist < 1000 ? `${Math.round(dist)} m away` : `${(dist / 1000).toFixed(1)} km away`;
              return (
                <View style={styles.sheetRow}>
                  <Ionicons name="navigate" size={16} color="#457B9D" />
                  <Text style={styles.sheetDetail}>{label}</Text>
                </View>
              );
            })()}
            <TouchableOpacity style={styles.navigateBtn} onPress={() => handleNavigate(selectedHospital)}>
              <Ionicons name="navigate" size={22} color="#fff" />
              <Text style={styles.navigateBtnText}>Navigate</Text>
            </TouchableOpacity>
          </View>
        )}
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
});
