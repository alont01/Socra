import { Redirect } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { useAuth } from '@/src/context/auth'
import { colors } from '@/src/theme'

// Entry gate: route to the app or the login screen based on session state.
export default function Index() {
  const { token, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  return <Redirect href={token ? '/(app)/children' : '/login'} />
}
