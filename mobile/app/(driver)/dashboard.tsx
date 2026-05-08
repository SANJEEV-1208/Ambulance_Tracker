import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import { AuthAPI } from '../../services/api';
import { socketService } from '../../services/socket';
import { StorageService } from '../../services/storage';
import { LOCATION_UPDATE_INTERVAL_MS } from '../../constants/config';
import type { Driver } from '../../types';

export default function DriverDashboard() {
  const router = useRouter();
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [driver, setDriver] = useState<Driver | null>(null);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Load driver profile
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
        // Token expired or invalid
        if (err.message?.includes('401') || err.message?.includes('token')) {
          handleLogout();
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Connect socket with auth token
  useEffect(() => {
    (async () => {
      const token = await StorageService.getToken();
      if (token) socketService.connect(token);
    })();

    return () => {
      stopLocationSharing();
      socketService.disconnect();
    };
  }, []);

  // Start/stop location sharing when duty status changes
  useEffect(() => {
    if (isOnDuty) {
      startLocationSharing();
    } else {
      stopLocationSharing();
    }
    return () => stopLocationSharing();
  }, [isOnDuty]);

  const startLocationSharing = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationError('Location permission denied. Cannot share position.');
      setIsOnDuty(false);
      return;
    }

    setLocationError(null);

    // Send immediately, then on interval
    const sendLocation = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const { latitude, longitude } = loc.coords;
        setLastLocation({ lat: latitude, lng: longitude });

        const socket = socketService.get();
        socket?.emit('driver:update_location', { latitude, longitude });
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

    if (value) {
      socket?.emit('driver:on_duty');
      setIsOnDuty(true);
    } else {
      socket?.emit('driver:off_duty');
      setIsOnDuty(false);
      setLastLocation(null);
    }

    setToggling(false);
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'You will be signed out and set to off duty.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          const socket = socketService.get();
          socket?.emit('driver:off_duty');
          socketService.disconnect();
          await StorageService.clearAuth();
          router.replace('/(driver)/login');
        },
      },
    ]);
  }

  async function handleChangeRole() {
    Alert.alert(
      'Switch Role',
      'This will log you out and reset your role. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          style: 'destructive',
          onPress: async () => {
            const socket = socketService.get();
            socket?.emit('driver:off_duty');
            socketService.disconnect();
            await StorageService.clearAll();
            router.replace('/role-select');
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#E63946" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Status card */}
        <View style={[styles.statusCard, isOnDuty ? styles.statusCardOn : styles.statusCardOff]}>
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.statusLabel}>Duty Status</Text>
              <Text style={[styles.statusValue, isOnDuty ? styles.statusOn : styles.statusOff]}>
                {isOnDuty ? '● On Duty' : '○ Off Duty'}
              </Text>
            </View>
            {toggling ? (
              <ActivityIndicator color={isOnDuty ? '#2DC653' : '#ADB5BD'} />
            ) : (
              <Switch
                value={isOnDuty}
                onValueChange={toggleDuty}
                trackColor={{ false: '#DEE2E6', true: '#2DC653' }}
                thumbColor={isOnDuty ? '#fff' : '#fff'}
                ios_backgroundColor="#DEE2E6"
              />
            )}
          </View>

          {isOnDuty && (
            <Text style={styles.statusHint}>
              {lastLocation
                ? `Sharing location — ${lastLocation.lat.toFixed(5)}, ${lastLocation.lng.toFixed(5)}`
                : 'Acquiring GPS signal…'}
            </Text>
          )}

          {locationError && (
            <Text style={styles.locationError}>{locationError}</Text>
          )}
        </View>

        {/* Driver profile */}
        {driver && (
          <View style={styles.profileCard}>
            <Text style={styles.sectionTitle}>Driver Profile</Text>

            <InfoRow icon="person" label="Name" value={driver.name} />
            <InfoRow icon="mail" label="Email" value={driver.email} />
            <InfoRow icon="call" label="Phone" value={driver.phone} />
            <InfoRow icon="car" label="Vehicle" value={driver.vehicle_number} />
          </View>
        )}

        {/* Info box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color="#457B9D" />
          <Text style={styles.infoText}>
            Keep the app open while on duty. Location updates every{' '}
            {LOCATION_UPDATE_INTERVAL_MS / 1000} seconds. Going off duty or closing the
            app will remove you from the live map.
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#E63946" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.switchRoleBtn} onPress={handleChangeRole}>
          <Ionicons name="swap-horizontal" size={18} color="#457B9D" />
          <Text style={styles.switchRoleText}>Switch to User mode</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={infoRowStyles.row}>
      <Ionicons name={icon as any} size={16} color="#457B9D" style={{ width: 20 }} />
      <Text style={infoRowStyles.label}>{label}</Text>
      <Text style={infoRowStyles.value}>{value}</Text>
    </View>
  );
}

const infoRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1FAEE',
    gap: 8,
  },
  label: { width: 64, fontSize: 13, color: '#457B9D', fontWeight: '600' },
  value: { flex: 1, fontSize: 15, color: '#1D3557' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1FAEE' },
  scroll: { padding: 20, gap: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statusCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  statusCardOn: { backgroundColor: '#ECFDF5', borderWidth: 1.5, borderColor: '#2DC653' },
  statusCardOff: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#DEE2E6' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 13, color: '#457B9D', fontWeight: '600' },
  statusValue: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  statusOn: { color: '#2DC653' },
  statusOff: { color: '#ADB5BD' },
  statusHint: { fontSize: 12, color: '#2DC653', marginTop: 10, fontWeight: '500' },
  locationError: { fontSize: 12, color: '#E63946', marginTop: 8 },

  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D3557',
    marginBottom: 8,
  },

  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#EBF4FA',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, color: '#457B9D', lineHeight: 19 },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0F1',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#FFCCD0',
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#E63946' },

  switchRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  switchRoleText: { fontSize: 14, color: '#457B9D' },
});
