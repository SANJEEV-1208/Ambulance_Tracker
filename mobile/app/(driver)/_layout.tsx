import { Stack } from 'expo-router';

export default function DriverLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#1D3557' },
        headerTintColor: '#F1FAEE',
        headerTitleStyle: { fontWeight: '700' },
      }}
    />
  );
}
