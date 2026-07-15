import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/src/context/auth'
import { apiFetch } from '@/src/lib/api'
import { colors, radius, space } from '@/src/theme'

interface Child {
  id: string
  name: string
  gradeLevel: string
  goals: string
  avgMastery: number | null
  topicsTracked: number
  lastSession: { topic: string; endedAt: string | null } | null
}

function masteryTone(avg: number | null) {
  if (avg === null) return { text: 'No data yet', bg: colors.primaryTint, fg: colors.primaryDark }
  if (avg >= 0.8) return { text: 'Mastered', bg: colors.greenTint, fg: colors.green }
  if (avg >= 0.5) return { text: 'Progressing', bg: colors.amberTint, fg: colors.amber }
  return { text: 'Building', bg: colors.primaryTint, fg: colors.primaryDark }
}

export default function ChildrenScreen() {
  const router = useRouter()
  const { token, user, logout } = useAuth()

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['children'],
    queryFn: () => apiFetch<{ children: Child[] }>('/api/parent/children', { token }),
  })

  const children = data?.children ?? []
  const parentName = user?.parentProfile?.name || 'there'

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hi}>Hi {parentName}!</Text>
          <Text style={styles.sub}>Your children&apos;s progress</Text>
        </View>
        <TouchableOpacity onPress={logout} hitSlop={8}>
          <Text style={styles.signout}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Couldn&apos;t load your children.</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
        </View>
      ) : children.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No children linked yet</Text>
          <Text style={styles.muted}>Ask your child&apos;s tutor for an invite link, then open it on the web to link their account.</Text>
        </View>
      ) : (
        <FlatList
          data={children}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: space(4), gap: space(3) }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const tone = masteryTone(item.avgMastery)
            const pct = item.avgMastery === null ? null : Math.round(item.avgMastery * 100)
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => router.push(`/(app)/child/${item.id}`)}
              >
                <View style={styles.cardTop}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    {!!item.gradeLevel && <Text style={styles.faint}>{item.gradeLevel}</Text>}
                  </View>
                  <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.pillText, { color: tone.fg }]}>{tone.text}</Text>
                  </View>
                </View>

                {pct !== null && (
                  <View style={{ marginTop: space(3) }}>
                    <View style={styles.barRow}>
                      <Text style={styles.faint}>Average mastery</Text>
                      <Text style={styles.pct}>{pct}%</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%` }]} />
                    </View>
                  </View>
                )}

                <Text style={[styles.faint, { marginTop: space(3) }]}>
                  {item.topicsTracked} topic{item.topicsTracked === 1 ? '' : 's'} tracked
                  {item.lastSession ? ` · last: ${item.lastSession.topic || 'session'}` : ' · no sessions yet'}
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), paddingTop: space(2), paddingBottom: space(3) },
  hi: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  signout: { fontSize: 14, color: colors.primaryDark, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8), gap: space(3) },
  muted: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  retry: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: space(5), paddingVertical: space(2.5) },
  retryText: { color: colors.white, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space(5), borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  avatar: { height: 44, width: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 18, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  faint: { fontSize: 13, color: colors.textFaint },
  pill: { paddingHorizontal: space(2.5), paddingVertical: space(1), borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '600' },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space(1.5) },
  pct: { fontSize: 13, fontWeight: '600', color: colors.text },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: '#F5F5F4', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999, backgroundColor: colors.primary },
})
