// Side-effectful notifications for session scheduling, kept out of the API
// route body — mirrors lib/match-notify.ts.

import { prisma } from '@/lib/prisma'
import { config } from '@/lib/config'
import { sendEmail, sessionScheduledEmailHtml } from '@/lib/email'
import { createLogger } from '@/lib/logger'

const logger = createLogger('session-notify')

const isRealEmail = (email?: string | null) => !!email && !email.endsWith('@students.socra.internal')

export function formatWhen(scheduledAt: Date | null): string {
  if (!scheduledAt) return 'Time to be confirmed'
  // Runs on the server, where the host clock is UTC — without an explicit zone
  // this tells a family their 4pm lesson is at 9pm. Name the zone in the string
  // too, so it's unambiguous for anyone reading it from elsewhere.
  const when = scheduledAt.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: config.timeZone,
  })
  const zone = scheduledAt.toLocaleTimeString('en-US', {
    timeZone: config.timeZone, timeZoneName: 'short',
  }).split(' ').pop()
  return zone ? `${when} ${zone}` : when
}

/**
 * Email the parent (if linked) and/or the student (if they have a real,
 * deliverable email — parent-created accounts use a synthetic address) that a
 * session has been scheduled. Best-effort: never throws into the caller.
 */
export async function notifySessionScheduled(sessionId: string): Promise<void> {
  try {
    const session = await prisma.tutoringSession.findUnique({
      where: { id: sessionId },
      include: {
        tutor: { select: { name: true } },
        student: {
          include: {
            user: { select: { email: true } },
            parent: { select: { name: true, user: { select: { email: true } } } },
          },
        },
      },
    })
    if (!session?.student) return

    const whenText = formatWhen(session.scheduledAt)
    const recipients: Promise<boolean>[] = []

    if (isRealEmail(session.student.user.email)) {
      recipients.push(
        sendEmail({
          to: session.student.user.email,
          subject: `Session scheduled with ${session.tutor.name}`,
          html: sessionScheduledEmailHtml({
            recipientName: session.student.name,
            studentName: session.student.name,
            tutorName: session.tutor.name,
            topic: session.topic,
            whenText,
            isParent: false,
          }),
        }),
      )
    }

    const parentEmail = session.student.parent?.user.email
    if (isRealEmail(parentEmail)) {
      recipients.push(
        sendEmail({
          to: parentEmail!,
          subject: `${session.student.name}'s session scheduled with ${session.tutor.name}`,
          html: sessionScheduledEmailHtml({
            recipientName: session.student.parent!.name,
            studentName: session.student.name,
            tutorName: session.tutor.name,
            topic: session.topic,
            whenText,
            isParent: true,
          }),
        }),
      )
    }

    await Promise.allSettled(recipients)
  } catch (err) {
    logger.error('Failed to send session-scheduled notification', err, { sessionId })
  }
}

/** Exported for tests — the zone handling here is easy to regress silently. */
export { formatWhen as formatWhenForTest }
