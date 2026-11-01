// Headless check that two accounts on one phone never mix. Serves dist/
// with `vite preview`, answers every Supabase call locally (a fake cloud
// that enforces "your rows only" like RLS), and drives the real sign-in and
// sign-out buttons:
//
//   0. The phone still has the old shared database (pre-v4) holding A's
//      closet: one synced piece, one made offline and never synced.
//   1. B signs in first. B sees an empty closet, the old database is left
//      alone (it is not B's), and nothing of A's goes up under B.
//   2. B signs out, A signs in. A gets the old closet (2 pieces) and A's
//      offline piece is pushed, under A's id and folder only.
//   3. A adds a piece while uploads fail (stays unsynced), signs out.
//   4. B signs in again: still an empty closet, no request of B's carries
//      any of A's pieces, A's unsynced piece is still in A's own database.
//      B adds a piece: it goes up under B only.
//   5. A signs back in: A's 3 pieces, not B's; A's waiting piece now
//      pushes as A.
// Fails on any console error (the deliberate 500s for "uploads fail" show
// up as "Failed to load resource" network lines; those are not app errors).
//
//   cd app && npm run build && node scripts/accounts-check.mjs
//
// Nothing reaches the real project (REST, storage, auth and the Realtime
// socket are all answered here). Chromium: same CHROMIUM trick as the others.
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.SHOT_PORT) || 4175

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, bad) => {
  const t = setTimeout(() => bad(new Error('preview did not start')), 60000)
  server.stdout.on('data', (d) => { if (String(d).includes('http')) { clearTimeout(t); ok() } })
  server.stderr.on('data', (d) => process.stderr.write(d))
})

const A = '00000000-0000-4000-8000-0000000000a1'
const B = '00000000-0000-4000-8000-0000000000b2'
const EMAIL = { 'a@test.dev': A, 'b@test.dev': B }
const L1 = '11111111-0000-4000-8000-000000000001' // A's, synced before v4
const L2 = '11111111-0000-4000-8000-000000000002' // A's, made offline before v4, never synced
const A3 = '11111111-0000-4000-8000-000000000003' // A's, added while uploads fail
const B1 = '22222222-0000-4000-8000-000000000001' // B's own
const A_IDS = [L1, L2, A3]
const A_NAMES = ['Legacy denim jacket', 'Offline scarf', 'Secret tee']

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwtFor = (id, email) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })}.sig`
const userOf = (id) => ({ id, aud: 'authenticated', role: 'authenticated', email: Object.keys(EMAIL).find((e) => EMAIL[e] === id) })
const subOf = (req) => {
  const auth = req.headers()['authorization'] ?? ''
  try { return JSON.parse(Buffer.from(auth.replace(/^Bearer /, '').split('.')[1] ?? '', 'base64url').toString()).sub ?? null } catch { return null }
}

// The fake cloud: rows per owner, like RLS would scope them.
const cloud = { [A]: new Map(), [B]: new Map() }
const row = (id, name, owner) => ({
  id, user_id: owner, name, category: 'outerwear', colours: ['denim'], pattern: 'solid', warmth: 3, formality: 2, seasons: ['fall'],
  brand: null, notes: null, status: 'active', favourite: false, tucked: false, photo_path: `${owner}/${id}/photo.jpg`, cutout_path: `${owner}/${id}/cutout.png`,
  fabric: null, fit: null, feel: null, links: [], size: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
})
cloud[A].set(L1, row(L1, 'Legacy denim jacket', A))
const failUploads = { [A]: false, [B]: false }
const log = [] // every write-ish request: { sub, method, path, body }

const exe = process.env.CHROMIUM || chromium.executablePath()
const browser = await chromium.launch({ headless: true, executablePath: exe })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
// The Realtime socket goes nowhere: never reaches the real project.
await ctx.routeWebSocket(/supabase\.co/, () => {})
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
await ctx.route(/supabase\.co\//, async (route) => {
  const req = route.request()
  const u = new URL(req.url())
  const p = u.pathname, m = req.method(), sub = subOf(req)
  if (p.endsWith('/auth/v1/token')) {
    const email = req.postDataJSON()?.email
    const id = EMAIL[email]
    if (!id) return json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400)
    return json(route, { access_token: jwtFor(id, email), refresh_token: `r-${id}`, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: userOf(id) })
  }
  if (p.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' })
  if (p.endsWith('/auth/v1/user')) return sub ? json(route, userOf(sub)) : json(route, { message: 'no session' }, 401)
  if (p.includes('/storage/v1/object/') && m === 'POST' && !p.includes('/sign/')) {
    const path = decodeURIComponent(p.split('/storage/v1/object/closet/')[1] ?? '')
    log.push({ sub, method: m, path: `storage:${path}`, body: '' })
    if (!sub || failUploads[sub]) return json(route, { error: 'offline' }, 500)
    if (!path.startsWith(`${sub}/`)) return json(route, { error: 'new row violates row-level security policy' }, 403)
    return json(route, { Key: `closet/${path}`, Id: path })
  }
  if (p.endsWith('/rest/v1/items')) {
    const mine = sub ? cloud[sub] : new Map()
    if (m === 'GET') {
      const ids = u.searchParams.get('id')?.replace(/^in\.\(|\)$/g, '').split(',')
      const owner = u.searchParams.get('user_id')?.replace(/^eq\./, '')
      const rows = owner && owner !== sub ? [] : [...mine.values()].filter((r) => !ids || ids.includes(r.id))
      return json(route, u.searchParams.get('select') === 'id' ? rows.map((r) => ({ id: r.id })) : rows)
    }
    const body = req.postData() ?? ''
    log.push({ sub, method: m, path: `rest:items${u.search}`, body })
    if (m === 'POST') {
      const r = JSON.parse(body)
      if (r.user_id !== sub) return json(route, { message: 'new row violates row-level security policy' }, 403)
      mine.set(r.id, r)
      return route.fulfill({ status: 201, body: '' })
    }
    return route.fulfill({ status: 204, body: '' })
  }
  if (p.includes('/rest/v1/') && m !== 'GET' && m !== 'HEAD') log.push({ sub, method: m, path: `rest:${p.split('/rest/v1/')[1]}`, body: req.postData() ?? '' })
  if (p.includes('/rest/v1/rpc/')) return json(route, null)
  return json(route, [])
})

const page = await ctx.newPage()
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error' && !/realtime\/v1\/websocket|Failed to load resource/.test(msg.text())) errors.push(msg.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

/* ---------- helpers ---------- */

const dbName = (id) => `poppyseed-v2-${id}`
const stores = { items: ['category', 'status', 'favourite', 'createdAt', 'synced'], tombstones: [], profile: [], measurements: ['takenOn', 'synced'], avatar: [] }
/** Put pieces straight into a database (creating it with the app's schema if it is not there yet). */
async function seed(name, pieces) {
  await page.evaluate(async ([name, pieces, stores]) => {
    const png = (fill) => new Promise((ok) => {
      const c = document.createElement('canvas'); c.width = c.height = 120
      const g = c.getContext('2d'); g.fillStyle = fill; g.fillRect(20, 20, 80, 80); c.toBlob(ok, 'image/png')
    })
    const db = await new Promise((ok, bad) => {
      const r = indexedDB.open(name, 50) // Dexie version 5 = IndexedDB version 50
      r.onupgradeneeded = () => {
        for (const [s, idx] of Object.entries(stores)) {
          if (r.result.objectStoreNames.contains(s)) continue
          const st = r.result.createObjectStore(s, { keyPath: 'id' })
          for (const i of idx) st.createIndex(i, i)
        }
      }
      r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error)
    })
    const now = Date.now()
    const rows = []
    for (const p of pieces) {
      const blob = await png(p.fill)
      rows.push({ id: p.id, name: p.name, category: 'outerwear', colours: ['denim'], pattern: 'solid', warmth: 3, formality: 2, seasons: ['fall'], status: 'active', favourite: false, tucked: false, links: [], photo: blob, cutout: blob, createdAt: now, updatedAt: now, synced: p.synced })
    }
    const tx = db.transaction(['items'], 'readwrite')
    for (const r of rows) tx.objectStore('items').put(r)
    await new Promise((ok, bad) => { tx.oncomplete = ok; tx.onerror = () => bad(tx.error) })
    db.close()
  }, [name, pieces, stores])
}
/** Items in a database as [{ id, synced }], or null when the database does not exist. */
async function peek(name) {
  return page.evaluate(async (name) => {
    if (!(await indexedDB.databases()).some((d) => d.name === name)) return null
    const db = await new Promise((ok, bad) => { const r = indexedDB.open(name); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error) })
    if (!db.objectStoreNames.contains('items')) { db.close(); return [] }
    const all = await new Promise((ok) => { const q = db.transaction('items').objectStore('items').getAll(); q.onsuccess = () => ok(q.result) })
    db.close()
    return all.map((i) => ({ id: i.id, synced: i.synced }))
  }, name)
}
async function signIn(email) {
  await page.getByPlaceholder('email').fill(email)
  await page.getByPlaceholder('password').fill('secret-pass')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: 'Closet', exact: true }).waitFor({ timeout: 15000 })
}
async function signOut() {
  await page.getByRole('button', { name: /You$/ }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByText('Welcome back.').waitFor({ timeout: 10000 })
}
const piecesShown = () => page.locator('header p').first().innerText()
async function until(fn, what, ms = 10000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return; await page.waitForTimeout(150) }
  throw new Error('timed out waiting for ' + what)
}
const pushes = (sub) => log.filter((e) => e.sub === sub && (e.path.startsWith('storage:') || e.path.startsWith('rest:items')))
const mentionsA = (e) => A_IDS.some((id) => e.path.includes(id) || e.body.includes(id)) || A_NAMES.some((n) => e.body.includes(n)) || e.path.includes(A)
const check = (ok, msg) => { if (!ok) throw new Error(msg) }

try {
  // 0. Old shared database on the phone, holding A's closet.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await page.getByText('Welcome back.').waitFor({ timeout: 15000 })
  await seed('poppyseed-v2', [
    { id: L1, name: 'Legacy denim jacket', fill: '#4a6fa0', synced: 1 },
    { id: L2, name: 'Offline scarf', fill: '#e76f51', synced: 0 },
  ])

  // 1. B first: empty closet, old database untouched, nothing of A's under B.
  await signIn('b@test.dev')
  await page.getByText('Let’s fill your closet').or(page.getByText("Let's fill your closet")).waitFor({ timeout: 10000 })
  await page.waitForTimeout(1500) // let the first sync run
  check((await piecesShown()) === 'Nothing here yet', 'B should see an empty closet')
  check((await peek(dbName(B)))?.length === 0, 'B’s own database should be empty')
  check((await peek('poppyseed-v2'))?.length === 2, 'the old database is A’s: B must leave it alone')
  check(pushes(B).length === 0, 'B pushed pieces with nothing of their own: ' + JSON.stringify(pushes(B)))
  check(!log.some((e) => e.sub === B && mentionsA(e)), 'something of A’s went up under B')

  // 2. A: gets the old closet, the offline piece goes up as A.
  await signOut()
  await signIn('a@test.dev')
  await until(async () => (await piecesShown()) === '2 pieces', 'A’s 2 pieces from the old database')
  await until(async () => cloud[A].has(L2), 'A’s offline piece to sync')
  await until(async () => (await peek('poppyseed-v2')) === null, 'the old database to be deleted once claimed')
  const aWrites = pushes(A)
  check(aWrites.length >= 3 && aWrites.every((e) => e.path.startsWith(`storage:${A}/`) || e.path.startsWith('rest:items')), 'A’s pushes must use A’s folder')
  check(JSON.parse(aWrites.find((e) => e.path.startsWith('rest:items')).body).user_id === A, 'A’s row must carry A’s id')

  // 3. A adds a piece while uploads fail: it waits, unsynced, in A's own database.
  failUploads[A] = true
  await seed(dbName(A), [{ id: A3, name: 'Secret tee', fill: '#9b5de5', synced: 0 }])
  await page.reload({ waitUntil: 'networkidle' })
  await until(async () => (await piecesShown()) === '3 pieces', 'A’s 3 pieces after the reload')
  await page.waitForTimeout(1000)
  check(!cloud[A].has(A3), 'A3 should still be waiting (uploads fail)')

  // 4. B again: empty, nothing of A's in any request of B's; then B's own piece goes up as B.
  await signOut()
  await signIn('b@test.dev')
  await page.waitForTimeout(1500)
  check((await piecesShown()) === 'Nothing here yet', 'B must not see A’s closet after A signed out')
  check(!log.some((e) => e.sub === B && mentionsA(e)), 'something of A’s went up under B: ' + JSON.stringify(log.filter((e) => e.sub === B && mentionsA(e))))
  check((await peek(dbName(B)))?.length === 0, 'B’s database must still be empty')
  const aDb = await peek(dbName(A))
  check(aDb?.length === 3 && aDb.find((i) => i.id === A3)?.synced === 0, 'A’s waiting piece must still be in A’s own database, unsynced')
  await seed(dbName(B), [{ id: B1, name: 'B hoodie', fill: '#2a9d8f', synced: 0 }])
  await page.reload({ waitUntil: 'networkidle' })
  await until(async () => (await piecesShown()) === '1 piece', 'B’s one piece')
  await until(async () => cloud[B].has(B1), 'B’s piece to sync')
  const bWrites = pushes(B)
  check(bWrites.every((e) => e.path.startsWith(`storage:${B}/${B1}/`) || (e.path.startsWith('rest:items') && JSON.parse(e.body).user_id === B && JSON.parse(e.body).id === B1)), 'B’s pushes must be B’s piece, under B: ' + JSON.stringify(bWrites))
  check(!bWrites.some(mentionsA), 'none of A’s pieces may ever go up under B')
  check([...cloud[B].keys()].join() === B1, 'B’s cloud holds only B’s piece')

  // 5. A again: A's 3 pieces (not B's), and the waiting one now goes up as A.
  failUploads[A] = false
  await signOut()
  await signIn('a@test.dev')
  await until(async () => (await piecesShown()) === '3 pieces', 'A’s 3 pieces again')
  check(!(await page.getByText('B hoodie').count()), 'A must not see B’s piece')
  await until(async () => cloud[A].has(A3), 'A’s waiting piece to sync as A')
  check(log.filter((e) => e.path.includes(A3) || e.body.includes(A3)).every((e) => e.sub === A), 'A3 only ever went up under A')
  check([...cloud[A].keys()].sort().join() === [L1, L2, A3].sort().join(), 'A’s cloud holds exactly A’s three pieces')

  console.log(`accounts: B never saw or pushed A's closet (old shared database left for A), A claimed it and pushed only as A, B's piece only as B, ${log.length} writes checked, console errors: ${errors.length}`)
  for (const e of errors) console.log('  ' + e)
  if (errors.length) process.exitCode = 1
} catch (e) {
  console.error('accounts check failed:', e)
  await page.screenshot({ path: resolve(app, 'screenshots/accounts-failed.png') }).catch(() => {})
  for (const er of errors) console.log('  ' + er)
  process.exitCode = 1
} finally {
  await browser.close()
  server.kill()
}
