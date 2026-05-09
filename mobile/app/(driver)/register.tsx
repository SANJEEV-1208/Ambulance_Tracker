import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthAPI } from '../../services/api';
import { StorageService } from '../../services/storage';

export default function RegisterScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    vehicle_number: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form) {
    return (value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleRegister() {
    const { name, email, phone, vehicle_number, password, confirmPassword } = form;

    if (!name || !email || !phone || !vehicle_number || !password) {
      Alert.alert('Validation', 'All fields are required.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await AuthAPI.register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        vehicle_number: vehicle_number.trim(),
        password,
      });
      Alert.alert('Success', 'Account created! Please sign in.', [
        { text: 'OK', onPress: () => router.replace('/(driver)/login') },
      ]);
    } catch (err: any) {
      Alert.alert('Registration Failed', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconWrap}>
            <Ionicons name="person-add" size={48} color="#E63946" />
          </View>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Register to start sharing your ambulance location</Text>

          <View style={styles.form}>
            <Field label="Full Name" icon="person-outline">
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={update('name')}
                placeholder="John Doe"
                placeholderTextColor="#ADB5BD"
                autoCapitalize="words"
              />
            </Field>

            <Field label="Email" icon="mail-outline">
              <TextInput
                style={styles.input}
                value={form.email}
                onChangeText={update('email')}
                placeholder="driver@example.com"
                placeholderTextColor="#ADB5BD"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>

            <Field label="Phone Number" icon="call-outline">
              <TextInput
                style={styles.input}
                value={form.phone}
                onChangeText={update('phone')}
                placeholder="+1234567890"
                placeholderTextColor="#ADB5BD"
                keyboardType="phone-pad"
              />
            </Field>

            <Field label="Vehicle / Ambulance Number" icon="car-outline">
              <TextInput
                style={styles.input}
                value={form.vehicle_number}
                onChangeText={update('vehicle_number')}
                placeholder="AMB-001"
                placeholderTextColor="#ADB5BD"
                autoCapitalize="characters"
              />
            </Field>

            <Field label="Password" icon="lock-closed-outline">
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                  value={form.password}
                  onChangeText={update('password')}
                  placeholder="Min. 6 characters"
                  placeholderTextColor="#ADB5BD"
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={{ padding: 4 }}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#ADB5BD" />
                </TouchableOpacity>
              </View>
            </Field>

            <Field label="Confirm Password" icon="lock-closed-outline">
              <TextInput
                style={styles.input}
                value={form.confirmPassword}
                onChangeText={update('confirmPassword')}
                placeholder="Repeat password"
                placeholderTextColor="#ADB5BD"
                secureTextEntry={!showPassword}
              />
            </Field>

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already registered? </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.loginLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={fieldStyles.labelRow}>
        <Ionicons name={icon as any} size={14} color="#457B9D" />
        <Text style={fieldStyles.label}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#1D3557' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1FAEE' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  iconWrap: { alignItems: 'center', marginTop: 24, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#1D3557', textAlign: 'center' },
  subtitle: {
    fontSize: 13,
    color: '#457B9D',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  form: {},
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#A8DADC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#1D3557',
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#A8DADC',
    borderRadius: 12,
    paddingRight: 12,
  },
  btn: {
    backgroundColor: '#E63946',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  loginText: { fontSize: 14, color: '#457B9D' },
  loginLink: { fontSize: 14, color: '#E63946', fontWeight: '700' },
});
