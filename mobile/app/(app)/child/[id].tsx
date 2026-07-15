import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/src/context/auth'
import { apiFetch } from '@/src/lib/api'
import { colors, radius, space } from '@/src/theme'

interface ProgressItem { topic: string; mastery: number; updatedAt: string }
interface SessionItem {
  id: string
  topic: string
  endedAt: string | null
  analysis: { summary: string; conceptsCovered: string[]; strengths: string[]; gaps: string[] } | null
}

function masteryLabel(m: number) {
  if (m >= 0.8) return { text: 'Mastered', bg: colors.greenTint, fg: colors.green }
  if (m >= 0.5) return { text: 'Progressing', bg: colors.amberTint, fg: colors.amber }
  return { text: 'Learning', bg: colors.primaryTint, fg: colors.primaryDark }
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function ChildDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { token } = useAuth()

  const progressQ = useQuery({
    queryKey: ['progress', id],
    queryFn: () => apiFetch<{ child: { name: string }; progress: ProgressItem[] }>(`/api/parent/children/${id}/progress`, { token }),
  })
  const sessionsQ = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => apiFetch<{ child: { name: string }; sessions: SessionItem[] }>(`/api/parent/children/${id}/sessions`, { token }),
  })

  const name = progressQ.data?.child?.name || sessionsQ.data?.child?.name || ''
  const progress = progressQ.data?.progress ?? []
  const sessions = sessionsQ.data?.sessions ?? []
  const loading = progressQ.isLoading || sessionsQ.isLoading
  const error = progressQ.isError || sessionsQ.isError

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>‹ Children</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.muted}>This child isn&apos;t linked to your account.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: space(4), gap: space(6) }}>
          <Text style={styles.title}>{name}&apos;s progress</Text>

          {/* Mastery */}
          <View style={{ gap: space(3) }}>
            <Text style={styles.section}>Topic mastery</Text>
            {progress.length === 0 ? (
              <View style={styles.card}><Text style={styles.muted}>No progress data yet.</Text></View>
            ) : (
              progress.map((p) => {
                const label = masteryLabel(p.mastery)
                const pct = Math.round(p.mastery * 100)
                return (
                  <View key={p.topic} style={styles.card}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.topic}>{p.topic}</Text>
                      <View style={[styles.pill, { backgroundColor: label.bg }]}>
                        <Text style={[styles.pillText, { color: label.fg }]}>{label.text}</Text>
                      </View>
                    </View>
                    <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
                    <Text style={styles.faint}>{pct}% mastery</Text>
                  </View>
                )
              })
            )}
          </View>

          {/* Sessions */}
          <View style={{ gap: space(3) }}>
            <Text style={styles.section}>Recent sessions</Text>
            {sessions.length === 0 ? (
              <View style={styles.card}><Text style={styles.muted}>No completed sessions yet.</Text></View>
            ) : (
              sessions.map((s) => (
                <View key={s.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.topic}>{s.topic || 'Math session'}</Text>
                    <Text style={styles.faint}>{fmtDate(s.endedAt)}</Text>
                  </View>
                  {s.analysis ? (
                    <>
                      {!!s.analysis.summary && <Text style={styles.summary}>{s.analysis.summary}</Text>}
                      <View style={styles.chips}>
                        {s.analysis.strengths.map((t, i) => (
                          <View key={`st${i}`} style={[styles.chip, { backgroundColor: colors.greenTint }]}>
                            <Text style={[styles.chipText, { color: colors.green }]}>✓ {t}</Text>
                          </View>
                        ))}
                        {s.analysis.gaps.map((t, i) => (
                          <View key={`gp${i}`} style={[styles.chip, { backgroundColor: colors.amberTint }]}>
                            <Text style={[styles.chipText, { color: colors.amber }]}>Focus: {t}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <Text style={styles.faint}>Analysis pending.</Text>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space(4), paddingTop: space(2), paddingBottom: space(1) },
  back: { fontSize: 15, color: colors.primaryDark, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8) },
  muted: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  section: { fontSize: 16, fontWeight: '700', color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: colors.border, gap: space(2) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  topic: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  faint: { fontSize: 13, color: colors.textFaint },
  summary: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  pill: { paddingHorizontal: space(2.5), paddingVertical: space(1), borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '600' },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: '#F5F5F4', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999, backgroundColor: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(1) },
  chip: { paddingHorizontal: space(2.5), paddingVertical: space(1), borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '600' },
})
