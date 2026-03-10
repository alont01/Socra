const DAILY_API_KEY = process.env.DAILY_API_KEY || ''
const DAILY_API_URL = 'https://api.daily.co/v1'

async function dailyFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${DAILY_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Daily API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function createRoom(sessionId: string) {
  const roomName = `session-${sessionId}`
  try {
    const room = await dailyFetch('/rooms', {
      method: 'POST',
      body: JSON.stringify({
        name: roomName,
        properties: {
          max_participants: 2,
          enable_recording: 'cloud',
          enable_transcription: {
            autostart: true,
          },
          enable_transcription_storage: true,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 3, // 3 hour expiry
          eject_at_room_exp: true,
        },
      }),
    })
    return {
      name: room.name as string,
      url: room.url as string,
    }
  } catch (err) {
    // If room already exists, fetch and return it
    if (err instanceof Error && err.message.includes('already exists')) {
      const room = await dailyFetch(`/rooms/${roomName}`)
      return {
        name: room.name as string,
        url: room.url as string,
      }
    }
    throw err
  }
}

export async function getMeetingToken(roomName: string, userName: string, isOwner: boolean) {
  const token = await dailyFetch('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        is_owner: isOwner,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 3,
      },
    }),
  })
  return token.token as string
}

export async function deleteRoom(roomName: string) {
  try {
    await dailyFetch(`/rooms/${roomName}`, { method: 'DELETE' })
  } catch {
    // Room might already be deleted
  }
}

export async function fetchTranscript(roomName: string): Promise<string | null> {
  try {
    // 1. List transcripts for this room and find a finished one
    const list = await dailyFetch(`/transcript?room_name=${roomName}`)
    const transcripts = list?.data as Array<{ transcriptId: string; status: string }> | undefined
    if (!transcripts || transcripts.length === 0) return null

    const finished = transcripts.find((t) => t.status === 't_finished')
    if (!finished) return null

    // 2. Get the access link for the transcript
    const linkResult = await dailyFetch(`/transcript/${finished.transcriptId}/access-link`)
    const downloadUrl = linkResult?.link as string | undefined
    if (!downloadUrl) return null

    // 3. Download the VTT content
    const vttRes = await fetch(downloadUrl)
    if (!vttRes.ok) return null
    const vttText = await vttRes.text()

    // 4. Convert VTT to plain text (strip timestamps and headers)
    return parseVttToText(vttText)
  } catch {
    return null
  }
}

function parseVttToText(vtt: string): string {
  const lines = vtt.split('\n')
  const textLines: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip WEBVTT header, blank lines, and timestamp lines
    if (!trimmed || trimmed === 'WEBVTT' || trimmed.includes('-->') || /^\d+$/.test(trimmed)) {
      continue
    }
    textLines.push(trimmed)
  }
  return textLines.join('\n')
}

export async function fetchTranscriptWithRetry(roomName: string, maxRetries = 5): Promise<string | null> {
  for (let i = 0; i < maxRetries; i++) {
    const transcript = await fetchTranscript(roomName)
    if (transcript) return transcript
    await new Promise((resolve) => setTimeout(resolve, 10000))
  }
  return null
}
