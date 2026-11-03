import { existsSync } from 'node:fs'
// Headless check for the wishlist closet. Serves dist/ with `vite preview`,
// signs in with a throwaway local session, seeds three of her own pieces and
// one wish piece into Dexie, and answers every Supabase call locally (a tiny
// fake cloud that keeps what the app pushes). Checks that:
//   - the Closet switch shows only her own pieces on My closet, only wishes on Wishlist,
//   - the Wishlist + opens a sheet with exactly 3 ways to add,
//   - Browse stores lists the 4 stores; adding a piece puts it on the Wishlist
//     (✨ On my wishlist), removing archives it (gone from the grid, row archived),
//     adding it again brings back the same piece rather than a second copy,
//   - a wish piece's sheet has 🎉 Move to my closet and no wash / put away, and
//     moving it lands it in My closet; the designer notes box shows on pieces,
//   - Paste a link: "Unknown mode" (function not redeployed) shows the screenshot
//     way out; a good answer opens New wish with the title filled in,
//   - Dress me offers the wish piece with its ✨ badge,
//   - a friend's closet never shows a wish row even if the server sends one,
//   - a fast double tap on ♡ Add saves one piece, not two,
//   - Dress me with only wish pieces on: Photo off with "Photos use clothes you own";
//     with one of her own on too, the photo job asks for her own piece only,
//   - pushes send closet 'wish' for wish pieces and no closet key for her own,
//     and "I got it" pushes closet 'mine' (else the cloud row stays on 'wish').
// Store images (dist/stores/<id>.webp) are answered here with a small PNG, so
// the check does not need the rendered set. Screenshots go to screenshots/wishlist-*.png.
// Fails on any console error.
//
//   cd app && npm run build && node scripts/wishlist-check.mjs
//
// Nothing reaches the real project. Chromium: same CHROMIUM trick as the others.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { chromium } from 'playwright-core'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.SHOT_PORT) || 4177

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, bad) => {
  const t = setTimeout(() => bad(new Error('preview did not start')), 60000)
  server.stdout.on('data', (d) => { if (String(d).includes('http')) { clearTimeout(t); ok() } })
  server.stderr.on('data', (d) => process.stderr.write(d))
})

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = '00000000-0000-4000-8000-000000000001'
const MAYA = '00000000-0000-4000-8000-000000000002'
const G1 = '00000000-0000-4000-8000-00000000000a'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER, aud: 'authenticated', role: 'authenticated', email: 'poppy@example.com', exp: 4102444800 })}.sig`
const user = { id: USER, aud: 'authenticated', role: 'authenticated', email: 'poppy@example.com' }
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
/** A small valid PNG: a peach square on a clear background, standing in for product shots. */
function makePng(size = 64) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type), data])
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, sum])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6 // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = y * (size * 4 + 1) + 1 + x * 4, inside = x > size / 5 && x < size * 4 / 5 && y > size / 8 && y < size * 7 / 8
    raw.set(inside ? [244, 162, 97, 255] : [0, 0, 0, 0], o)
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const PNG = makePng()

const at = (ms) => new Date(Date.now() + ms).toISOString()
const squad = { id: G1, name: 'Poppy’s Squad', owner_id: USER, tz: 'America/Chicago' }
const members = [
  { group_id: G1, user_id: USER, display_name: 'Poppy', emoji: '🌸', role: 'owner', joined_at: at(-9e8) },
  { group_id: G1, user_id: MAYA, display_name: 'Maya', emoji: '🦋', role: 'member', joined_at: at(-8e8) },
]
// What an older server (before v10) might still send for Maya: one of her own, one wish.
const friendRow = (id, name, closet) => ({ id, user_id: MAYA, name, category: 'outerwear', colours: ['denim'], pattern: 'solid', warmth: 3, formality: 2, status: 'active', notes: null, cutout_path: `${MAYA}/${id}/cutout.png`, closet })
const mayaItems = [friendRow('f1', 'Maya denim jacket', 'mine'), friendRow('f2', 'Maya secret wish gown', 'wish')]

const IMPORT = {
  title: 'Rainbow tiered skirt', store: 'Example Shop', price: '$28', url: 'https://shop.example.com/p/rainbow-skirt',
  image: { media_type: 'image/png', data: PNG.toString('base64') },
  description: { name: 'rainbow skirt', category: 'bottom', colours: ['pink', 'yellow'], pattern: 'stripe', warmth: 2, formality: 2, seasons: ['summer'], fabric: 'cotton', fit: 'tiered, knee length', feel: 'sunny', brand: '', size: '', search_query: 'rainbow tiered skirt' },
}
let importMode = 'unknown' // the function before it is redeployed with 'import'

// The fake cloud: what the app pushed, by id, plus every row upsert body in order.
const cloud = new Map()
const pushes = []
// Photo jobs the Photo button queued (a parent's yes is on in this check).
const jobs = []

const exe = process.env.CHROMIUM || chromium.executablePath()
const browser = await chromium.launch({
  headless: true, executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
// Service workers blocked so every request (store images included) reaches the routes below.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v) }, ['sb-yrcddfehjjbtzwuotmym-auth-token', JSON.stringify(session)])
await ctx.routeWebSocket(/supabase\.co/, () => {}) // the Realtime socket goes nowhere
// Store product shots may not be rendered yet: answer each with a small PNG.
// Real store images are used when they are in dist/stores; otherwise a stand-in PNG.
if (!existsSync(new URL('../dist/stores/blush-tulle-gown.webp', import.meta.url))) {
  await ctx.route(/\/stores\/[a-z0-9-]+\.webp(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
}
// The background-removal model lives on a CDN: kept offline here, so AddItem's cutout fails politely.
await ctx.route(/staticimgly\.com/, (route) => route.abort())

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const dot = (r) => r.replace(/^(eq|in)\./, '').replace(/^\(|\)$/g, '')
await ctx.route(/supabase\.co\//, (route) => {
  const req = route.request()
  const u = new URL(req.url()), p = u.pathname, m = req.method(), q = u.searchParams
  if (p.endsWith('/auth/v1/user')) return json(route, user) // a real id: sync pushes and pulls
  if (p.endsWith('/functions/v1/describe-item')) {
    if (importMode === 'unknown') return json(route, { error: 'Unknown mode' }, 400)
    return json(route, IMPORT)
  }
  if (p.includes('/storage/v1/object/sign/closet/')) {
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" fill="#f4a261"/></svg>' })
  }
  if (p.includes('/storage/v1/object/sign/closet')) {
    const paths = req.postDataJSON()?.paths ?? []
    return json(route, paths.map((path) => ({ path, signedURL: `/object/sign/closet/${path}?token=x` })))
  }
  if (p.includes('/storage/v1/object/closet/') && m === 'POST') {
    const path = decodeURIComponent(p.split('/storage/v1/object/closet/')[1] ?? '')
    return json(route, { Key: `closet/${path}`, Id: path })
  }
  if (p.endsWith('/rest/v1/items')) {
    if (m === 'GET') return json(route, [...cloud.values()])
    if (m === 'POST') {
      const body = req.postDataJSON()
      for (const r of Array.isArray(body) ? body : [body]) { pushes.push(r); cloud.set(r.id, { ...cloud.get(r.id), ...r }) }
      return route.fulfill({ status: 201, body: '' })
    }
    return route.fulfill({ status: 204, body: '' })
  }
  if (p.endsWith('/rest/v1/group_members')) {
    if (q.get('user_id')) return json(route, [{ group_id: G1, display_name: 'Poppy', emoji: '🌸', role: 'owner', joined_at: members[0].joined_at, groups: squad }])
    return json(route, dot(q.get('group_id') ?? '') === G1 ? members : [])
  }
  if (p.endsWith('/rest/v1/photoreal_children')) return json(route, [{ user_id: USER }])
  if (p.endsWith('/rest/v1/photo_jobs')) {
    if (m === 'POST') {
      const body = req.postDataJSON()
      const job = { id: `job-${jobs.length + 1}`, user_id: USER, kind: body.kind, entry_id: null, round_id: null, item_ids: body.item_ids, status: 'queued', result_path: null, error: null, created_at: new Date().toISOString(), finished_at: null }
      jobs.unshift(job)
      return json(route, job, 201)
    }
    return json(route, jobs)
  }
  if (p.endsWith('/rest/v1/rpc/friend_items')) return json(route, req.postDataJSON()?.member === MAYA ? mayaItems : [])
  if (p.endsWith('/rest/v1/rpc/can_pick_theme')) return json(route, false)
  if (p.includes('/rest/v1/rpc/')) return json(route, null)
  if (p.includes('/rest/v1/') && m !== 'GET' && m !== 'HEAD') return route.fulfill({ status: 201, body: '' })
  return json(route, [])
})

const page = await ctx.newPage()
const errors = []
// While AddItem tries to cut out the imported photo, the offline model logs its failure; that is the sandbox.
let cutoutOffline = false
page.on('console', (msg) => {
  if (msg.type() !== 'error' || /realtime\/v1\/websocket|Failed to load resource/.test(msg.text())) return
  if (cutoutOffline) return
  errors.push(msg.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
const shots = resolve(app, 'screenshots')
mkdirSync(shots, { recursive: true })
const shot = (name) => page.screenshot({ path: resolve(shots, `wishlist-${name}.png`) })

const DB = `poppyseed-v2-${USER}`
const check = (ok, msg) => { if (!ok) throw new Error(msg) }
const tab = (name) => page.getByRole('button', { name: new RegExp(name + '$') }).last()
const grid = () => page.locator('main').first()
const inGrid = async (name) => (await grid().getByText(name, { exact: true }).count()) > 0
const switchTo = (which) => page.getByTestId('closet-switch').getByRole('tab', { name: which === 'wish' ? /Wishlist/ : /My closet/ }).click()
/** Every piece in her database, without the photos. */
const dbItems = () => page.evaluate(async (DB) => {
  const db = await new Promise((ok, bad) => { const r = indexedDB.open(DB); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error) })
  const rows = await new Promise((ok) => { const r = db.transaction('items').objectStore('items').getAll(); r.onsuccess = () => ok(r.result) })
  db.close()
  return rows.map(({ photo, cutout, ...rest }) => rest)
}, DB)
const until = async (fn, msg, ms = 15000) => {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await fn()) return; await page.waitForTimeout(200) }
  throw new Error(msg)
}
/** Tap the dark backdrop above a bottom sheet to close it. */
const closeSheet = () => page.mouse.click(195, 30)

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Closet', exact: true }).waitFor({ timeout: 15000 })

  // Seed three of her own pieces (no closet field, like every piece made before v10) and one wish.
  await page.evaluate(async (DB) => {
    const png = (fill) => new Promise((ok) => {
      const c = document.createElement('canvas'); c.width = c.height = 200
      const g = c.getContext('2d'); g.fillStyle = fill; g.fillRect(40, 30, 120, 150); c.toBlob(ok, 'image/png')
    })
    const items = [
      { id: 'm1', name: 'Mint knit top', category: 'top', colours: ['green'], pattern: 'solid', fill: '#8fd3b0', fabric: 'cotton knit', fit: 'relaxed' },
      { id: 'm2', name: 'Denim skirt', category: 'bottom', colours: ['denim'], pattern: 'solid', fill: '#4a6fa0' },
      { id: 'm3', name: 'White sneakers', category: 'shoes', colours: ['white'], pattern: 'solid', fill: '#f6f4f0' },
      { id: 'w1', name: 'Sparkle wish top', category: 'top', colours: ['purple'], pattern: 'texture', fill: '#b48be0', fabric: 'sequins', closet: 'wish' },
    ]
    const now = Date.now()
    const rows = []
    for (const it of items) {
      const blob = await png(it.fill)
      const { fill, ...rest } = it
      rows.push({ ...rest, warmth: 3, formality: 2, seasons: ['spring'], status: 'active', favourite: false, tucked: false, links: [], photo: blob, cutout: blob, createdAt: now, updatedAt: now, synced: 0 })
    }
    let db
    for (let i = 0; i < 50 && !db; i++) {
      if ((await indexedDB.databases()).some((d) => d.name === DB)) db = await new Promise((ok, bad) => { const r = indexedDB.open(DB); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error) })
      if (db && !db.objectStoreNames.contains('items')) { db.close(); db = undefined }
      if (!db) await new Promise((ok) => setTimeout(ok, 100))
    }
    if (!db) throw new Error('closet database never appeared')
    const tx = db.transaction(['items', 'profile'], 'readwrite')
    for (const r of rows) tx.objectStore('items').put(r)
    tx.objectStore('profile').put({ id: 'me', heightIn: 60, updatedAt: now, synced: 0 })
    await new Promise((ok, bad) => { tx.oncomplete = ok; tx.onerror = () => bad(tx.error) })
    db.close()
  }, DB)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Closet', exact: true }).waitFor({ timeout: 15000 })

  // 1. The switch: My closet has only hers, Wishlist only the wish.
  await grid().getByText('Mint knit top', { exact: true }).waitFor({ timeout: 10000 })
  for (const n of ['Mint knit top', 'Denim skirt', 'White sneakers']) check(await inGrid(n), `${n} should be in My closet`)
  check(!(await inGrid('Sparkle wish top')), 'a wish piece showed in My closet')
  await switchTo('wish')
  await grid().getByText('Sparkle wish top', { exact: true }).waitFor({ timeout: 5000 })
  for (const n of ['Mint knit top', 'Denim skirt', 'White sneakers']) check(!(await inGrid(n)), `${n} showed on the Wishlist`)
  await shot('switch')

  // 2. The Wishlist +: a sheet with three ways in.
  await page.getByTestId('closet-add').click()
  const sheet = page.getByTestId('wish-add-sheet')
  await sheet.waitFor({ timeout: 5000 })
  check(await sheet.getByRole('button').count() === 3, 'the wish + sheet should have 3 options')
  for (const b of ['🛍️ Browse stores', '🔗 Paste a link', '📸 Snap or screenshot']) check(await sheet.getByRole('button', { name: b }).count() === 1, `missing ${b}`)
  await shot('add-sheet')

  // 3. Stores: 4 of them; add, remove, add again.
  await sheet.getByRole('button', { name: '🛍️ Browse stores' }).click()
  const stores = page.getByTestId('store-browser')
  await stores.waitFor({ timeout: 5000 })
  check(await stores.locator('header button').count() === 5, 'stores header should be Done plus 4 store chips')
  for (const s of ['Starlight Atelier']) check(await stores.locator('header').getByText(s).count() === 1, `${s} chip missing`)
  const GOWN = 'store:starlight/blush-tulle-gown'
  await stores.getByRole('button', { name: '♡ Add' }).first().click()
  await stores.getByRole('button', { name: '✓ On my wishlist' }).first().waitFor({ timeout: 10000 })
  let gowns = (await dbItems()).filter((i) => i.notes?.includes(GOWN))
  check(gowns.length === 1 && gowns[0].closet === 'wish' && gowns[0].status === 'active' && gowns[0].brand === 'Starlight Atelier', 'store add should save one active wish piece')
  const gownId = gowns[0].id
  // tap the piece: its sheet with the designer's notes
  await stores.getByRole('button', { name: /blush tulle gown/ }).first().click()
  await stores.getByTestId('designer-note').waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
  await shot('store-piece')
  await closeSheet()
  await stores.getByTestId('designer-note').waitFor({ state: 'detached', timeout: 5000 })
  await page.waitForTimeout(300)
  await shot('stores')
  await stores.getByRole('button', { name: 'Done' }).click()
  await grid().getByText('blush tulle gown', { exact: true }).waitFor({ timeout: 5000 })
  await grid().getByText('blush tulle gown', { exact: true }).click()
  await page.getByText('✨ On my wishlist', { exact: true }).waitFor({ timeout: 5000 })
  await closeSheet()
  await page.getByText('✨ On my wishlist', { exact: true }).waitFor({ state: 'detached', timeout: 5000 })
  // remove: archived, off the grid
  await page.getByTestId('closet-add').click()
  await sheet.getByRole('button', { name: '🛍️ Browse stores' }).click()
  await stores.getByRole('button', { name: '✓ On my wishlist' }).first().click()
  await until(async () => (await dbItems()).find((i) => i.id === gownId)?.status === 'archived', 'removing should archive the piece')
  await stores.getByRole('button', { name: 'Done' }).click()
  await grid().getByText('blush tulle gown', { exact: true }).waitFor({ state: 'detached', timeout: 5000 })
  // add again: the same piece comes back, no second copy
  await page.getByTestId('closet-add').click()
  await sheet.getByRole('button', { name: '🛍️ Browse stores' }).click()
  await stores.getByRole('button', { name: '♡ Add' }).first().click()
  await until(async () => (await dbItems()).find((i) => i.id === gownId)?.status === 'active', 're-adding should bring the same piece back')
  gowns = (await dbItems()).filter((i) => i.notes?.includes(GOWN))
  check(gowns.length === 1 && gowns[0].id === gownId, 're-adding made a second copy')
  // a fast double tap on another piece: one copy, never two
  const fromStarlight = async () => (await dbItems()).filter((i) => i.notes?.includes('store:starlight/') && !i.notes.includes(GOWN))
  check((await fromStarlight()).length === 0, 'no other Starlight piece should be on the wishlist yet')
  await stores.getByRole('button', { name: '♡ Add' }).first().evaluate((el) => { el.click(); el.click() })
  await until(async () => (await fromStarlight()).length > 0, 'double tap never added the piece')
  await page.waitForTimeout(400)
  await stores.getByRole('button', { name: '✓ On my wishlist' }).nth(1).waitFor({ timeout: 5000 })
  check((await fromStarlight()).length === 1, `a double tap on ♡ Add saved ${(await fromStarlight()).length} copies`)
  await stores.getByRole('button', { name: 'Done' }).click()
  await grid().getByText('blush tulle gown', { exact: true }).waitFor({ timeout: 5000 })

  // 4. Dress me offers the wish piece, with its badge.
  await page.getByTestId('dress-me-button').click()
  await page.locator('[data-testid=dress-me] canvas').waitFor({ timeout: 20000 })
  await page.getByTestId('avatar-loading').waitFor({ state: 'detached', timeout: 90000 })
  const view = page.getByTestId('dress-me')
  await view.getByRole('button', { name: /^Top/ }).first().click()
  const wishPiece = view.getByTestId('piece').filter({ hasText: 'Sparkle wish top' })
  await wishPiece.waitFor({ timeout: 5000 })
  check(await wishPiece.locator('[title="Wishlist piece"]').count() === 1, 'wish piece should carry the ✨ badge in Dress me')
  check(await view.getByTestId('piece').filter({ hasText: 'Mint knit top' }).locator('[title="Wishlist piece"]').count() === 0, 'her own piece should not carry the badge')
  await wishPiece.click()
  await page.waitForTimeout(800)
  await shot('dress-me')
  // only a wish piece on: no photo, and the reason says so
  const photoBtn = view.getByTestId('photo-button')
  await photoBtn.waitFor({ timeout: 10000 })
  check(await photoBtn.isDisabled(), 'Photo should be off with only a wish piece on')
  await view.getByTestId('photo-own-only').getByText('Photos use clothes you own').waitFor({ timeout: 5000 })
  // her own skirt on too: Photo works, and the job asks for the skirt only
  await view.getByRole('button', { name: /^Bottom/ }).first().click()
  await view.getByTestId('piece').filter({ hasText: 'Denim skirt' }).click()
  await until(async () => !(await photoBtn.isDisabled()), 'Photo should turn on once one of her own pieces is on')
  check(await view.getByTestId('photo-own-only').count() === 0, 'the own-only line should go once her own piece is on')
  await photoBtn.click()
  await until(async () => jobs.length > 0, 'the Photo button never queued a job')
  check(JSON.stringify(jobs[0].item_ids) === JSON.stringify(['m2']), `the photo job should ask for her skirt only, got ${JSON.stringify(jobs[0].item_ids)}`)
  await view.getByRole('button', { name: /Closet$/ }).click()
  await view.waitFor({ state: 'detached', timeout: 5000 })

  // 5. A wish piece's sheet: move to my closet, no wash or put away, designer notes.
  await grid().getByText('Sparkle wish top', { exact: true }).click()
  await page.getByRole('button', { name: '🎉 I got it! Move to my closet' }).waitFor({ timeout: 5000 })
  check(await page.getByRole('button', { name: /In the wash/ }).count() === 0, 'wash should be hidden on a wish piece')
  check(await page.getByRole('button', { name: /Put away/ }).count() === 0, 'put away should be hidden on a wish piece')
  check(await page.getByRole('button', { name: '🗑️ Remove from wishlist' }).count() === 1, 'remove from wishlist missing')
  check(await page.getByTestId('designer-note').count() === 1, 'designer notes missing on a wish piece')
  await page.waitForTimeout(300)
  await shot('item-sheet')
  await page.getByRole('button', { name: '🎉 I got it! Move to my closet' }).click()
  await page.getByTestId('designer-note').waitFor({ state: 'detached', timeout: 5000 })
  await grid().getByText('Sparkle wish top', { exact: true }).waitFor({ state: 'detached', timeout: 5000 })
  await switchTo('mine')
  await grid().getByText('Sparkle wish top', { exact: true }).waitFor({ timeout: 5000 })
  check((await dbItems()).find((i) => i.id === 'w1')?.closet === 'mine', 'moved piece should be closet mine')
  // her own piece: wash and put away as before, designer notes too
  await grid().getByText('Mint knit top', { exact: true }).click()
  await page.getByRole('button', { name: /In the wash/ }).waitFor({ timeout: 5000 })
  check(await page.getByRole('button', { name: /Put away/ }).count() === 1, 'put away should show on her own piece')
  check(await page.getByTestId('designer-note').count() === 1, 'designer notes missing on her own piece')
  check(await page.getByRole('button', { name: /Move to my closet/ }).count() === 0, 'move to my closet should not show on her own piece')
  await closeSheet()
  await page.getByTestId('designer-note').waitFor({ state: 'detached', timeout: 5000 })

  // 6. Paste a link: first the function is not redeployed, then it answers.
  await switchTo('wish')
  await page.getByTestId('closet-add').click()
  await sheet.getByRole('button', { name: '🔗 Paste a link' }).click()
  const linkBox = sheet.getByPlaceholder(/a link to the piece/)
  await linkBox.fill('https://shop.example.com/p/rainbow-skirt')
  await sheet.getByRole('button', { name: '✨ Bring it in' }).click()
  await sheet.getByText("Couldn't read that link. Take a screenshot of the piece and add it with 📸 instead.").waitFor({ timeout: 10000 })
  check(await sheet.getByRole('button', { name: '📸 Add a screenshot' }).count() === 1, 'fallback button missing')
  await shot('link-fallback')
  importMode = 'ok'
  await linkBox.fill('shop.example.com/p/rainbow-skirt')
  cutoutOffline = true
  await sheet.getByRole('button', { name: '✨ Bring it in' }).click()
  await page.getByRole('heading', { name: '✨ New wish' }).waitFor({ timeout: 10000 })
  const name = await page.getByPlaceholder('e.g. mustard knit').inputValue()
  check(name === IMPORT.title, `imported name should be the title, got "${name}"`)
  const brand = await page.getByPlaceholder('e.g. Zara').inputValue()
  check(brand === IMPORT.store, `imported brand should be the store, got "${brand}"`)
  // the cutout model is offline here: wait for AddItem to say so before leaving
  await page.getByText(/Couldn't cut out the background/).waitFor({ timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(300)
  await shot('link-import')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('heading', { name: 'Closet', exact: true }).waitFor({ timeout: 5000 })
  await page.waitForTimeout(500)
  cutoutOffline = false

  // 7. A friend's closet never shows a wish, even from an older server that sends one.
  await tab('Squad').click()
  await page.getByRole('button', { name: /Maya/ }).first().click()
  await page.getByRole('heading', { name: "Maya's closet" }).waitFor({ timeout: 10000 })
  await page.getByText('Maya denim jacket', { exact: true }).waitFor({ timeout: 10000 })
  check(await page.getByText('Maya secret wish gown').count() === 0, "a friend's wish piece showed in her closet")
  check(await page.getByText('1 pieces', { exact: true }).count() === 1, "friend closet should count 1 piece")
  await page.waitForTimeout(300)
  await shot('friend-closet')

  // 8. Pushes: closet 'wish' for wish pieces, no closet key for her own (old) pieces.
  await until(() => pushes.some((r) => r.id === gownId) && pushes.some((r) => r.id === 'm1'), 'pieces were never pushed')
  check(pushes.filter((r) => r.id === gownId).every((r) => r.closet === 'wish'), 'store wish piece pushed without closet wish')
  check(pushes.some((r) => r.id === 'w1' && r.closet === 'wish'), 'seeded wish piece never pushed with closet wish')
  for (const id of ['m1', 'm2', 'm3']) check(pushes.filter((r) => r.id === id).every((r) => !('closet' in r)), `${id} pushed with a closet key`)
  // "I got it": the push after the move says 'mine', so the cloud row leaves the wishlist too
  await until(() => pushes.some((r) => r.id === 'w1' && r.closet === 'mine'), '"I got it" never pushed closet mine for the moved piece')
  check(cloud.get('w1')?.closet === 'mine', 'the cloud row for the moved piece should end on closet mine')

  console.log(`wishlist: switch ok, + sheet ok, 4 stores + add/remove/re-add (same id) ok, Dress me badge ok, wish sheet + move ok, designer notes ok, link fallback + import prefill ok, friend wish hidden ok, double tap one copy ok, wish-only Photo off + own-only job ok, push closet keys (I got it = mine) ok (${pushes.length} row pushes), console errors: ${errors.length}`)
  for (const e of errors) console.log('  ' + e)
  if (errors.length) process.exitCode = 1
} catch (e) {
  console.error('wishlist check failed:', e)
  await page.screenshot({ path: resolve(shots, 'wishlist-failed.png') }).catch(() => {})
  for (const er of errors) console.log('  ' + er)
  process.exitCode = 1
} finally {
  await browser.close()
  server.kill()
}
