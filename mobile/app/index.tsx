import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { StorageService } from '../services/storage';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const role = await StorageService.getRole();

      if (!role) {
        router.replace('/role-select');
        return;
      }

      if (role === 'user') {
        router.replace('/(user)');
        return;
      }

      // Driver: check if already authenticated
      const token = await StorageService.getToken();
      if (token) {
        router.replace('/(driver)/dashboard');
      } else {
        router.replace('/(driver)/login');
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#E63946" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1FAEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
