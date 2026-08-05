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
//
// Exits 0 if every check passes, 1 otherwise.

const BASE = (process.argv[2] || process.env.SMOKE_URL || 'https://www.socratutoring.com').replace(/\/$/, '')
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 20000)

const checks = []
function check(name, fn) {
  checks.push({ name, fn })
}

async function fetchWithTimeout(path, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(BASE + path, { redirect: 'follow', signal: controller.signal, ...init })
  } finally {
    clearTimeout(timer)
  }
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
