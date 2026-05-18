import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AmbulanceAPI } from '../../services/api';
import { socketService } from '../../services/socket';
import { StorageService } from '../../services/storage';
import { OSM_TILE_URL } from '../../constants/config';
import type {
  Ambulance,
  AmbulanceLocationUpdate,
  AmbulanceOnDutyEvent,
  AmbulanceOffDutyEvent,
} from '../../types';

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
    .amb-marker {
      background: #E63946; width: 36px; height: 36px; border-radius: 50%;
      border: 2px solid white; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(230,57,70,0.5);
    }
    .user-dot {
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

  var ambMarkers = {};
  var userMarker = null;

  var ambIcon = L.divIcon({
    className: '',
    html: '<div class="amb-marker"><svg viewBox="0 0 24 24" fill="white" width="18" height="18"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg></div>',
    iconSize: [36, 36], iconAnchor: [18, 36]
  });

  function updateAmbulances(list) {
    Object.values(ambMarkers).forEach(function(m) { map.removeLayer(m); });
    ambMarkers = {};
    list.forEach(function(amb) {
      if (!amb.latitude || !amb.longitude) return;
      var m = L.marker([amb.latitude, amb.longitude], { icon: ambIcon });
      m.on('click', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerClick', id: amb.id }));
      });
      m.addTo(map);
      ambMarkers[amb.id] = m;
    });
  }

  function setUserLocation(lat, lng) {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
    }).addTo(map);
    map.setView([lat, lng], 14);
  }

  function panToUser() {
    if (userMarker) map.setView(userMarker.getLatLng(), 14);
  }
</script>
</body>
</html>
`;

export default function UserMapScreen() {
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapReadyRef = useRef(false);
  const ambulancesRef = useRef<Map<string, Ambulance>>(new Map());

  const [ambulances, setAmbulances] = useState<Map<string, Ambulance>>(new Map());
  const [selectedAmbulance, setSelectedAmbulance] = useState<Ambulance | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [fetchingAmbulances, setFetchingAmbulances] = useState(false);

  const injectAmbulances = useCallback((ambs: Map<string, Ambulance>) => {
    const list = Array.from(ambs.values()).filter((a) => a.latitude !== 0 && a.longitude !== 0);
    webViewRef.current?.injectJavaScript(`updateAmbulances(${JSON.stringify(list)}); true;`);
  }, []);

  useEffect(() => {
    ambulancesRef.current = ambulances;
  }, [ambulances]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingLocation(false);
        Alert.alert('Location Required', 'Allow location access to see ambulances near you.');
        return;
      }
      setLocationGranted(true);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      locationRef.current = { lat: latitude, lng: longitude };
      setLoadingLocation(false);
      if (mapReadyRef.current) {
        webViewRef.current?.injectJavaScript(`setUserLocation(${latitude}, ${longitude}); true;`);
      }
      fetchNearby(latitude, longitude);
    })();
  }, []);

  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    setFetchingAmbulances(true);
    try {
      const { ambulances: list } = await AmbulanceAPI.getNearby(lat, lng);
      const newMap = new Map(list.map((a) => [a.id, a]));
      setAmbulances(newMap);
      ambulancesRef.current = newMap;
      injectAmbulances(newMap);
    } catch (err) {
      console.warn('Failed to fetch ambulances:', err);
    } finally {
      setFetchingAmbulances(false);
    }
  }, [injectAmbulances]);

  useEffect(() => {
    const socket = socketService.connect();

    socket.on('ambulance:location_updated', (data: AmbulanceLocationUpdate) => {
      setAmbulances((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(data.driverId);
        if (existing) {
          updated.set(data.driverId, { ...existing, latitude: data.latitude, longitude: data.longitude, last_seen: data.timestamp });
          ambulancesRef.current = updated;
          injectAmbulances(updated);
        }
        return updated;
      });
    });

    socket.on('ambulance:on_duty', (data: AmbulanceOnDutyEvent) => {
      setAmbulances((prev) => {
        const updated = new Map(prev);
        if (!updated.has(data.driverId)) {
          updated.set(data.driverId, {
            id: data.driverId, name: data.name, phone: data.phone,
            vehicle_number: data.vehicle_number, latitude: 0, longitude: 0,
            distance_meters: 0, last_seen: new Date().toISOString(),
          });
          ambulancesRef.current = updated;
          injectAmbulances(updated);
        }
        return updated;
      });
    });

    socket.on('ambulance:off_duty', (data: AmbulanceOffDutyEvent) => {
      setAmbulances((prev) => {
        const updated = new Map(prev);
        updated.delete(data.driverId);
        ambulancesRef.current = updated;
        injectAmbulances(updated);
        return updated;
      });
    });

    return () => {
      socket.off('ambulance:location_updated');
      socket.off('ambulance:on_duty');
      socket.off('ambulance:off_duty');
      socketService.disconnect();
    };
  }, [injectAmbulances]);

  function handleMapLoaded() {
    mapReadyRef.current = true;
    if (locationRef.current) {
      const { lat, lng } = locationRef.current;
      webViewRef.current?.injectJavaScript(`setUserLocation(${lat}, ${lng}); true;`);
    }
    if (ambulancesRef.current.size > 0) {
      injectAmbulances(ambulancesRef.current);
    }
  }

  function handleMapMessage(event: any) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'markerClick') {
        const amb = ambulancesRef.current.get(data.id);
        if (amb) setSelectedAmbulance(amb);
      }
    } catch (_) {}
  }

  function handleCallDriver(phone: string) {
    const url = `tel:${phone}`;
    Linking.canOpenURL(url)
      .then((ok) => { if (ok) Linking.openURL(url); else Alert.alert('Error', 'Cannot make phone calls on this device.'); })
      .catch(() => Alert.alert('Error', 'Failed to open phone dialer.'));
  }

  async function handleChangeRole() {
    Alert.alert('Change Role', 'This will reset your role selection.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => {
        socketService.disconnect();
        await StorageService.clearAll();
        router.replace('/role-select');
      }},
    ]);
  }

  function formatDistance(meters: number): string {
    if (meters < 1000) return `${meters} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  const ambulanceList = Array.from(ambulances.values()).filter((a) => a.latitude !== 0 && a.longitude !== 0);

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

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.topBarContent}>
          <View style={styles.badge}>
            <Ionicons name="radio" size={12} color="#2DC653" />
            <Text style={styles.badgeText}>
              {fetchingAmbulances ? 'Updating…' : `${ambulanceList.length} ambulance${ambulanceList.length !== 1 ? 's' : ''} nearby`}
            </Text>
          </View>
          <TouchableOpacity style={styles.settingsBtn} onPress={handleChangeRole}>
            <Ionicons name="settings-outline" size={22} color="#1D3557" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {locationGranted && (
        <TouchableOpacity
          style={styles.locateBtn}
          onPress={async () => {
            const loc = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = loc.coords;
            webViewRef.current?.injectJavaScript(`setUserLocation(${latitude}, ${longitude}); true;`);
            fetchNearby(latitude, longitude);
          }}
        >
          <Ionicons name="locate" size={22} color="#1D3557" />
        </TouchableOpacity>
      )}

      {loadingLocation && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#E63946" />
          <Text style={styles.loadingText}>Getting your location…</Text>
        </View>
      )}

      <Modal visible={!!selectedAmbulance} transparent animationType="slide" onRequestClose={() => setSelectedAmbulance(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSelectedAmbulance(null)} />
        {selectedAmbulance && (
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="medical" size={28} color="#E63946" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetName}>{selectedAmbulance.name}</Text>
                <Text style={styles.sheetVehicle}>{selectedAmbulance.vehicle_number}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedAmbulance(null)}>
                <Ionicons name="close-circle" size={28} color="#ADB5BD" />
              </TouchableOpacity>
            </View>
            <View style={styles.sheetRow}>
              <Ionicons name="navigate" size={16} color="#457B9D" />
              <Text style={styles.sheetDetail}>{formatDistance(selectedAmbulance.distance_meters)} away</Text>
            </View>
            <View style={styles.sheetRow}>
              <Ionicons name="call" size={16} color="#457B9D" />
              <Text style={styles.sheetDetail}>{selectedAmbulance.phone}</Text>
            </View>
            <TouchableOpacity style={styles.callButton} onPress={() => handleCallDriver(selectedAmbulance.phone)}>
              <Ionicons name="call" size={22} color="#fff" />
              <Text style={styles.callButtonText}>Call Driver</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1FAEE' },
  map: { ...StyleSheet.absoluteFillObject },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarContent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    margin: 16, marginTop: Platform.OS === 'android' ? 40 : 12,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  badgeText: { fontSize: 13, fontWeight: '600', color: '#1D3557' },
  settingsBtn: {
    backgroundColor: '#fff', width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  locateBtn: {
    position: 'absolute', bottom: 32, right: 16, backgroundColor: '#fff',
    width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(241,250,238,0.92)',
    justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingText: { fontSize: 15, color: '#457B9D', fontWeight: '500' },
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
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFF0F1',
    justifyContent: 'center', alignItems: 'center',
  },
  sheetName: { fontSize: 18, fontWeight: '700', color: '#1D3557' },
  sheetVehicle: { fontSize: 13, color: '#457B9D', marginTop: 2 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sheetDetail: { fontSize: 15, color: '#1D3557' },
  callButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2DC653', borderRadius: 14, paddingVertical: 16, marginTop: 12, gap: 10,
  },
  callButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
