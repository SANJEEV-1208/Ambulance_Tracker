import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StorageService } from '../services/storage';
import { AppRole } from '../types';

export default function RoleSelectScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function selectRole(role: AppRole) {
    setLoading(true);
    await StorageService.setRole(role);

    if (role === 'user') {
      router.replace('/(user)');
    } else {
      router.replace('/(driver)/login');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="medical" size={64} color="#E63946" />
        <Text style={styles.title}>AmbulanceTracker</Text>
        <Text style={styles.subtitle}>
          Real-time ambulance location for emergency responders
        </Text>
      </View>

      <View style={styles.cards}>
        <Text style={styles.prompt}>I am a…</Text>

        <TouchableOpacity
          style={[styles.card, styles.cardUser]}
          onPress={() => selectRole('user')}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Ionicons name="person" size={40} color="#1D3557" />
          <Text style={styles.cardTitle}>Emergency Responder</Text>
          <Text style={styles.cardDesc}>
            See nearby on-duty ambulances on a live map. No sign-up required.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.cardDriver]}
          onPress={() => selectRole('driver')}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Ionicons name="car" size={40} color="#fff" />
          <Text style={[styles.cardTitle, { color: '#fff' }]}>Ambulance Driver</Text>
          <Text style={[styles.cardDesc, { color: '#F1FAEE' }]}>
            Register and log in to go on duty and share your live location.
          </Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#E63946" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1FAEE',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 40,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1D3557',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#457B9D',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  prompt: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1D3557',
    marginBottom: 16,
    textAlign: 'center',
  },
  cards: {
    flex: 1,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardUser: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#A8DADC',
  },
  cardDriver: {
    backgroundColor: '#E63946',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D3557',
    marginTop: 12,
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 14,
    color: '#457B9D',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
