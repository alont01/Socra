import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/src/context/auth'
import { ApiError } from '@/src/lib/api'
import { colors, radius, space } from '@/src/theme'

export default function LoginScreen() {
  const router = useRouter()
  const { login, logout } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async () => {
    if (!email.trim() || !password || busy) return
    setBusy(true)
    setError('')
    try {
      const user = await login(email, password)
      // This app only serves parents; sign out others with a clear message.
      if (user.role !== 'PARENT') {
        await logout().catch(() => {})
        setError('This app is for parents. Use the web app for tutor or student accounts.')
        return
      }
      router.replace('/(app)/children')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError('Invalid email or password.')
      else if (e instanceof ApiError) setError(e.message)
      else setError('Something went wrong. Please try again.')
      await logout().catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.brandRow}>
          <View style={styles.logo}><Text style={styles.logoText}>∑</Text></View>
          <Text style={styles.brand}>Socra</Text>
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to follow your child&apos;s progress.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!busy}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoComplete="password"
            editable={!busy}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, (busy || !email.trim() || !password) && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy || !email.trim() || !password}
          activeOpacity={0.85}
        >
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Log in</Text>}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Parents sign in with the account they created from their invite link.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: space(6) },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space(2.5), marginBottom: space(8) },
  logo: {
    height: 36, width: 36, borderRadius: radius.sm, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { color: colors.white, fontSize: 20, fontWeight: '700' },
  brand: { fontSize: 20, fontWeight: '700', color: colors.text },
  title: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: space(1.5), marginBottom: space(6) },
  field: { marginBottom: space(4) },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: space(1.5) },
  input: {
    backgroundColor: colors.card, borderRadius: radius.sm, paddingHorizontal: space(3.5),
    paddingVertical: space(3.5), fontSize: 16, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  error: { color: colors.danger, fontSize: 14, marginBottom: space(3) },
  button: {
    backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: space(4),
    alignItems: 'center', marginTop: space(2),
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, color: colors.textFaint, textAlign: 'center', marginTop: space(5) },
})
