#!/usr/bin/env node
// Production smoke test — verifies a running Socra deployment is alive.
//
// Runs against a LIVE environment (no build, no DB access of its own): it hits
// the deployed app over HTTP and asserts the health probe and key public
// routes respond. Use it after a deploy, on a schedule (see the smoke GitHub
// workflow), or locally against any environment.
//
//   node scripts/smoke.mjs                         # defaults to production
//   SMOKE_URL=https://staging.example.com npm run smoke
//   node scripts/smoke.mjs http://localhost:3000
//   node scripts/smoke.mjs --wait                  # poll /api/health until
//                                                  # healthy first (post-deploy)
//
// Exits 0 if every check passes, 1 otherwise.

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const positional = args.filter((a) => !a.startsWith('--'))

const BASE = (positional[0] || process.env.SMOKE_URL || 'https://www.socratutoring.com').replace(/\/$/, '')
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 20000)
const WAIT = flags.includes('--wait') || process.env.SMOKE_WAIT === '1'
const WAIT_TIMEOUT_MS = Number(process.env.SMOKE_WAIT_TIMEOUT_MS || 180000)
const WAIT_INTERVAL_MS = Number(process.env.SMOKE_WAIT_INTERVAL_MS || 5000)

async function fetchWithTimeout(path, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(BASE + path, { redirect: 'follow', signal: controller.signal, ...init })
  } finally {
    clearTimeout(timer)
  }
}

// Poll the health probe until the deployment reports healthy. Useful right
// after a deploy, when the host may briefly 502 while the new build boots.
async function waitForHealthy() {
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  process.stdout.write(`  Waiting for ${BASE} to be healthy `)
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout('/api/health')
      if (res.status === 200) {
        const body = await res.json()
        if (body.status === 'ok') {
          process.stdout.write(' \x1b[32mup\x1b[0m\n')
          return true
        }
      }
    } catch {
      // not up yet — keep polling
    }
    process.stdout.write('.')
    await new Promise((r) => setTimeout(r, WAIT_INTERVAL_MS))
  }
  process.stdout.write(' \x1b[31mtimed out\x1b[0m\n')
  return false
}

const checks = []
function check(name, fn) {
  checks.push({ name, fn })
}

check('health probe returns 200 + status ok + db up', async () => {
  const res = await fetchWithTimeout('/api/health')
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`)
  const body = await res.json()
  if (body.status !== 'ok') throw new Error(`status="${body.status}" (expected "ok")`)
  if (body.db !== 'up') throw new Error(`db="${body.db}" (expected "up")`)
  return `commit ${String(body.commit || '?').slice(0, 7)} · db ${body.db}`
})

check('landing page loads', async () => {
  const res = await fetchWithTimeout('/')
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`)
  const html = await res.text()
  if (!/socra/i.test(html)) throw new Error('response did not mention "Socra"')
  return `${res.status} · ${html.length} bytes`
})

check('auth page loads', async () => {
  const res = await fetchWithTimeout('/auth')
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`)
  return `${res.status}`
})

const run = async () => {
  console.log(`\n  Smoke test → ${BASE}\n`)

  if (WAIT) {
    const healthy = await waitForHealthy()
    if (!healthy) {
      console.log(`\n  \x1b[31mDeployment never became healthy — aborting.\x1b[0m\n`)
      process.exit(1)
    }
    console.log('')
  }

  let failed = 0
  for (const { name, fn } of checks) {
    try {
      const detail = await fn()
      console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? `  \x1b[90m(${detail})\x1b[0m` : ''}`)
    } catch (err) {
      failed++
      console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m`)
    }
  }
  const total = checks.length
  console.log(`\n  ${total - failed}/${total} passed${failed ? ` · \x1b[31m${failed} failed\x1b[0m` : ''}\n`)
  process.exit(failed ? 1 : 0)
}

run()
