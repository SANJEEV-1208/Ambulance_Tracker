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
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AmbulanceAPI } from '../../services/api';
import { socketService } from '../../services/socket';
import { StorageService } from '../../services/storage';
import { DEFAULT_REGION, OSM_TILE_URL } from '../../constants/config';
import type {
  Ambulance,
  AmbulanceLocationUpdate,
  AmbulanceOnDutyEvent,
  AmbulanceOffDutyEvent,
} from '../../types';

export default function UserMapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [ambulances, setAmbulances] = useState<Map<string, Ambulance>>(new Map());
  const [selectedAmbulance, setSelectedAmbulance] = useState<Ambulance | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [fetchingAmbulances, setFetchingAmbulances] = useState(false);

  // Request location and pan to user
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingLocation(false);
        Alert.alert(
          'Location Required',
          'Allow location access to see ambulances near you.',
          [{ text: 'OK' }]
        );
        return;
      }

      setLocationGranted(true);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const userRegion: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      setRegion(userRegion);
      setLoadingLocation(false);
      fetchNearby(loc.coords.latitude, loc.coords.longitude);
    })();
  }, []);

  // Fetch nearby ambulances from REST API
  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    setFetchingAmbulances(true);
    try {
      const { ambulances: list } = await AmbulanceAPI.getNearby(lat, lng);
      setAmbulances(new Map(list.map((a) => [a.id, a])));
    } catch (err) {
      console.warn('Failed to fetch ambulances:', err);
    } finally {
      setFetchingAmbulances(false);
    }
  }, []);

  // Socket.io — real-time updates (no auth)
  useEffect(() => {
    const socket = socketService.connect();

    socket.on('ambulance:location_updated', (data: AmbulanceLocationUpdate) => {
      setAmbulances((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(data.driverId);
        if (existing) {
          updated.set(data.driverId, {
            ...existing,
            latitude: data.latitude,
            longitude: data.longitude,
            last_seen: data.timestamp,
          });
        }
        return updated;
      });
    });

    socket.on('ambulance:on_duty', (data: AmbulanceOnDutyEvent) => {
      setAmbulances((prev) => {
        const updated = new Map(prev);
        // Will be fully populated on next fetchNearby; add placeholder so marker appears
        if (!updated.has(data.driverId)) {
          updated.set(data.driverId, {
            id: data.driverId,
            name: data.name,
            phone: data.phone,
            vehicle_number: data.vehicle_number,
            latitude: 0,
            longitude: 0,
            distance_meters: 0,
            last_seen: new Date().toISOString(),
          });
        }
        return updated;
      });
    });

    socket.on('ambulance:off_duty', (data: AmbulanceOffDutyEvent) => {
      setAmbulances((prev) => {
        const updated = new Map(prev);
        updated.delete(data.driverId);
        return updated;
      });
    });

    return () => {
      socket.off('ambulance:location_updated');
      socket.off('ambulance:on_duty');
      socket.off('ambulance:off_duty');
      socketService.disconnect();
    };
  }, []);

  function handleCallDriver(phone: string) {
    const url = `tel:${phone}`;
    Linking.canOpenURL(url)
      .then((ok) => {
        if (ok) Linking.openURL(url);
        else Alert.alert('Error', 'Cannot make phone calls on this device.');
      })
      .catch(() => Alert.alert('Error', 'Failed to open phone dialer.'));
  }

  async function handleChangeRole() {
    Alert.alert('Change Role', 'This will reset your role selection.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          socketService.disconnect();
          await StorageService.clearAll();
          router.replace('/role-select');
        },
      },
    ]);
  }

  function formatDistance(meters: number): string {
    if (meters < 1000) return `${meters} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  const ambulanceList = Array.from(ambulances.values()).filter(
    (a) => a.latitude !== 0 && a.longitude !== 0
  );

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        mapType="none"
        region={region}
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
      >
        <UrlTile
          urlTemplate={OSM_TILE_URL}
          maximumZ={19}
          flipY={false}
          tileSize={256}
        />

        {ambulanceList.map((amb) => (
          <Marker
            key={amb.id}
            coordinate={{ latitude: amb.latitude, longitude: amb.longitude }}
            onPress={() => setSelectedAmbulance(amb)}
          >
            <View style={styles.markerContainer}>
              <View style={styles.markerBubble}>
                <Ionicons name="medical" size={18} color="#fff" />
              </View>
              <View style={styles.markerTail} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Top bar */}
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

      {/* My location button */}
      {locationGranted && (
        <TouchableOpacity
          style={styles.locateBtn}
          onPress={async () => {
            const loc = await Location.getCurrentPositionAsync({});
            mapRef.current?.animateToRegion({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            });
            fetchNearby(loc.coords.latitude, loc.coords.longitude);
          }}
        >
          <Ionicons name="locate" size={22} color="#1D3557" />
        </TouchableOpacity>
      )}

      {/* Loading overlay */}
      {loadingLocation && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#E63946" />
          <Text style={styles.loadingText}>Getting your location…</Text>
        </View>
      )}

      {/* Ambulance detail bottom sheet */}
      <Modal
        visible={!!selectedAmbulance}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedAmbulance(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedAmbulance(null)}
        />
        {selectedAmbulance && (
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Ionicons name="medical" size={28} color="#E63946" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetName}>{selectedAmbulance.name}</Text>
                <Text style={styles.sheetVehicle}>
                  {selectedAmbulance.vehicle_number}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedAmbulance(null)}>
                <Ionicons name="close-circle" size={28} color="#ADB5BD" />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetRow}>
              <Ionicons name="navigate" size={16} color="#457B9D" />
              <Text style={styles.sheetDetail}>
                {formatDistance(selectedAmbulance.distance_meters)} away
              </Text>
            </View>

            <View style={styles.sheetRow}>
              <Ionicons name="call" size={16} color="#457B9D" />
              <Text style={styles.sheetDetail}>{selectedAmbulance.phone}</Text>
            </View>

            <TouchableOpacity
              style={styles.callButton}
              onPress={() => handleCallDriver(selectedAmbulance.phone)}
            >
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

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 16,
    marginTop: Platform.OS === 'android' ? 40 : 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  badgeText: { fontSize: 13, fontWeight: '600', color: '#1D3557' },
  settingsBtn: {
    backgroundColor: '#fff',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },

  locateBtn: {
    position: 'absolute',
    bottom: 32,
    right: 16,
    backgroundColor: '#fff',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },

  markerContainer: { alignItems: 'center' },
  markerBubble: {
    backgroundColor: '#E63946',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#E63946',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#E63946',
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(241,250,238,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 15, color: '#457B9D', fontWeight: '500' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#DEE2E6',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  sheetIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF0F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetName: { fontSize: 18, fontWeight: '700', color: '#1D3557' },
  sheetVehicle: { fontSize: 13, color: '#457B9D', marginTop: 2 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sheetDetail: { fontSize: 15, color: '#1D3557' },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2DC653',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 12,
    gap: 10,
  },
  callButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
