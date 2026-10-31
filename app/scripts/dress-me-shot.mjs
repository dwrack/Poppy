// Headless check for the Dress me view: builds nothing, serves dist/ with
// `vite preview`, signs in with a throwaway local session, seeds four
// closet pieces into Dexie, opens Dress me, puts an outfit on, and saves
// screenshots/dress-me.png at iPhone size. Fails if the page logged any
// console error or the WebGL canvas never appeared.
//
//   cd app && npm run build && node scripts/dress-me-shot.mjs [extraShotsDir]
//
// Supabase is stubbed (every request answered locally), so nothing reaches
// the real project and no key is needed.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extraDir = process.argv[2]
const PORT = 4173

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, bad) => {
  const t = setTimeout(() => bad(new Error('preview did not start')), 20000)
  server.stdout.on('data', (d) => { if (String(d).includes('http')) { clearTimeout(t); ok() } })
  server.stderr.on('data', (d) => process.stderr.write(d))
})

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = '00000000-0000-4000-8000-000000000001'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', exp: 4102444800 })}.sig`
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'test@example.com' } }

const exe = process.env.CHROMIUM || chromium.executablePath()
const browser = await chromium.launch({
  headless: true, executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ['sb-yrcddfehjjbtzwuotmym-auth-token', JSON.stringify(session)])
// Nothing leaves the machine: auth/v1/user answers with no id, so sync stays idle; everything else is an empty list.
// photo_jobs remembers what the Photo button queued; studio_status stays empty, so the studio reads as offline.
const jobs = []
await ctx.route(/supabase\.co\//, (route) => {
  const req = route.request(), u = req.url()
  if (u.includes('/rest/v1/photo_jobs')) {
    if (req.method() === 'POST') {
      const body = req.postDataJSON()
      const job = { id: `job-${jobs.length + 1}`, user_id: USER, kind: body.kind, entry_id: null, round_id: null, item_ids: body.item_ids, status: 'queued', result_path: null, error: null, created_at: new Date().toISOString(), finished_at: null }
      for (const j of jobs) if (j.status === 'queued') Object.assign(j, { status: 'rejected', error: 'superseded' })
      jobs.unshift(job)
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(job) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(jobs) })
  }
  // the finished photo: a signed link, then a tiny peach PNG
  if (u.includes('/storage/v1/object/sign/photoreal/')) {
    return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8+P9/PQAJYwPMXnBWpwAAAABJRU5ErkJggg==', 'base64') })
  }
  if (u.includes('/storage/v1/object/sign/photoreal')) {
    const paths = req.postDataJSON()?.paths ?? []
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paths.map((path) => ({ path, signedURL: `/object/sign/photoreal/${path}?token=x` }))) })
  }
  route.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/auth/v1/user') ? '{}' : '[]' })
})

const page = await ctx.newPage()
const errors = []
// the Realtime socket cannot resolve the host offline; that is the sandbox, not the app
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('realtime/v1/websocket')) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Closet', exact: true }).waitFor({ timeout: 15000 })

  // Seed four pieces straight into the Dexie database, then reload so the live queries see them.
  await page.evaluate(async () => {
    const png = (draw) => new Promise((ok) => {
      const c = document.createElement('canvas'); c.width = c.height = 300
      const g = c.getContext('2d'); draw(g); c.toBlob(ok, 'image/png')
    })
    const shirt = (g, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(60, 70); g.lineTo(120, 40); g.lineTo(180, 40); g.lineTo(240, 70); g.lineTo(220, 120); g.lineTo(200, 110); g.lineTo(200, 260); g.lineTo(100, 260); g.lineTo(100, 110); g.lineTo(80, 120); g.closePath(); g.fill() }
    const skirt = (g, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(110, 60); g.lineTo(190, 60); g.lineTo(240, 260); g.lineTo(60, 260); g.closePath(); g.fill() }
    const shoe = (g, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(110, 190, 70, 35, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(200, 190, 70, 35, 0, 0, Math.PI * 2); g.fill() }
    const jacket = (g, fill) => { shirt(g, fill); g.fillStyle = '#fff'; g.fillRect(142, 60, 16, 200) }
    const items = [
      { id: 'a1', name: 'Pink stripe tee', category: 'top', colours: ['pink', 'white'], pattern: 'stripe', draw: (g) => shirt(g, '#f08cb8') },
      { id: 'a2', name: 'Denim skirt', category: 'bottom', colours: ['denim'], pattern: 'solid', draw: (g) => skirt(g, '#4a6fa0') },
      { id: 'a3', name: 'Floral dress', category: 'dress', colours: ['navy', 'yellow'], pattern: 'floral', draw: (g) => skirt(g, '#22304f') },
      { id: 'a4', name: 'Green jacket', category: 'outerwear', colours: ['green'], pattern: 'solid', draw: (g) => jacket(g, '#3d8a4f') },
      { id: 'a5', name: 'White sneakers', category: 'shoes', colours: ['white'], pattern: 'solid', draw: (g) => shoe(g, '#f6f4f0') },
    ]
    const now = Date.now()
    const rows = []
    for (const it of items) {
      const blob = await png(it.draw)
      const { draw, ...rest } = it
      rows.push({ ...rest, warmth: 3, formality: 2, seasons: ['spring'], status: 'active', favourite: false, tucked: false, photo: blob, cutout: blob, createdAt: now, updatedAt: now, synced: 0 })
    }
    const db = await new Promise((ok, bad) => { const r = indexedDB.open('poppyseed-v2'); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error) })
    const tx = db.transaction(['items', 'profile'], 'readwrite')
    for (const r of rows) tx.objectStore('items').put(r)
    tx.objectStore('profile').put({ id: 'me', heightIn: 60, updatedAt: now, synced: 0 })
    await new Promise((ok, bad) => { tx.oncomplete = ok; tx.onerror = () => bad(tx.error) })
    db.close()
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByTestId('dress-me-button').click()
  await page.locator('[data-testid=dress-me] canvas').waitFor({ timeout: 20000 })
  await page.getByTestId('avatar-loading').waitFor({ state: 'detached', timeout: 90000 })

  const hasGL = await page.evaluate(() => {
    const c = document.querySelector('[data-testid=dress-me] canvas')
    return !!(c && (c.getContext('webgl2') || c.getContext('webgl')))
  })
  if (!hasGL) throw new Error('no WebGL context on the Dress me canvas')

  const view = page.getByTestId('dress-me')
  const wear = async (slot) => {
    await view.getByRole('button', { name: new RegExp('^' + slot) }).first().click()
    await view.getByTestId('piece').first().click()
    await page.waitForTimeout(250)
  }
  await wear('Top'); await wear('Bottom'); await wear('Shoes'); await wear('Jacket')
  await page.waitForTimeout(800)

  // Photo: queue a photo-real render of this look; with no studio heartbeat the chip says so, in the exact words
  await page.getByTestId('photo-button').click()
  const chip = page.getByTestId('photo-chip')
  await chip.waitFor({ timeout: 10000 })
  if ((await chip.getAttribute('data-status')) !== 'offline') throw new Error('photo chip should read studio offline')
  if (!(await chip.innerText()).includes('Studio is offline, your photo will arrive later.')) throw new Error('offline copy missing')
  if (jobs.length !== 1 || jobs[0].kind !== 'dressme' || jobs[0].item_ids.length !== 4) throw new Error('photo job not queued with the four worn pieces')
  await page.screenshot({ path: resolve(app, 'screenshots/dress-me-photo-queued.png') })
  // the studio finishes it: the photo replaces her, with a 3D / Photo toggle
  Object.assign(jobs[0], { status: 'done', result_path: `${USER}/job-1.jpg`, finished_at: new Date().toISOString() })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await view.getByTestId('photo-real').waitFor({ timeout: 10000 })
  if ((await chip.getAttribute('data-status')) !== 'done') throw new Error('photo chip should read ready')
  await view.getByTestId('photo-toggle').getByRole('button', { name: /3D/ }).click()
  await view.getByTestId('photo-real').waitFor({ state: 'detached', timeout: 5000 })
  await view.getByTestId('photo-toggle').getByRole('button', { name: /Photo/ }).click()
  await view.getByTestId('photo-real').waitFor({ timeout: 5000 })
  await view.getByTestId('photo-toggle').getByRole('button', { name: /3D/ }).click()
  mkdirSync(resolve(app, 'screenshots'), { recursive: true })
  await page.screenshot({ path: resolve(app, 'screenshots/dress-me.png') })

  if (extraDir) {
    mkdirSync(extraDir, { recursive: true })
    for (const [move, wait] of [['Walk', 600], ['Sit', 900], ['Twirl', 700], ['Runway', 3700], ['Runway', 4200]]) {
      await view.getByRole('button', { name: new RegExp(move + '$') }).click()
      await page.waitForTimeout(wait)
      await page.screenshot({ path: resolve(extraDir, `${move.toLowerCase()}-${wait}.png`) })
    }
    await view.getByRole('button', { name: /Idle$/ }).click()
    await view.getByRole('button', { name: /^Dress/ }).first().click()
    await view.getByTestId('piece').first().click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: resolve(extraDir, 'dress.png') })
    // a few looks, to eyeball hair placement and skin tints
    const looks = [
      { face: 'sunny', skin: 'deep', hair: 'ponytail', hairColour: 'black', eyes: 'brown' },
      { face: 'wow', skin: 'porcelain', hair: 'buns', hairColour: 'pink', eyes: 'blue' },
      { face: 'chill', skin: 'tan', hair: 'braid', hairColour: 'blonde', eyes: 'green' },
      { face: 'sweet', skin: 'medium', hair: 'bob', hairColour: 'red', eyes: 'violet' },
      { face: 'sunny', skin: 'light', hair: 'pigtails', hairColour: 'auburn', eyes: 'hazel' },
      { face: 'chill', skin: 'olive', hair: 'curls', hairColour: 'dark brown', eyes: 'grey' },
    ]
    for (const look of looks) {
      await page.evaluate(async (l) => {
        const db = await new Promise((ok) => { const r = indexedDB.open('poppyseed-v2'); r.onsuccess = () => ok(r.result) })
        const tx = db.transaction(['avatar'], 'readwrite')
        tx.objectStore('avatar').put({ id: 'me', ...l, updatedAt: Date.now(), synced: 0 })
        await new Promise((ok) => { tx.oncomplete = ok })
        db.close()
      }, look)
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByTestId('dress-me-button').click()
      await page.locator('[data-testid=dress-me] canvas').waitFor({ timeout: 20000 })
      await page.getByTestId('avatar-loading').waitFor({ state: 'detached', timeout: 90000 })
      await page.waitForTimeout(600)
      await page.screenshot({ path: resolve(extraDir, `look-${look.hair}.png`), clip: { x: 0, y: 40, width: 390, height: 380 } })
    }
  }

  // You tab: the My avatar card's lazy preview must also come up
  await view.getByRole('button', { name: /Closet$/ }).click()
  await page.getByRole('button', { name: /You$/ }).click()
  await page.getByTestId('avatar-show').click()
  await page.locator('[data-testid=avatar-preview] canvas').waitFor({ timeout: 30000 })
  await page.waitForTimeout(2500)
  if (extraDir) await page.screenshot({ path: resolve(extraDir, 'you-tab.png') })

  console.log(`dress-me: canvas ok, webgl ok, photo queued + offline chip + ready toggle ok, you-tab preview ok, console errors: ${errors.length}`)
  for (const e of errors) console.log('  ' + e)
  if (errors.length) process.exitCode = 1
} catch (e) {
  console.error('dress-me check failed:', e)
  mkdirSync(resolve(app, 'screenshots'), { recursive: true })
  await page.screenshot({ path: resolve(app, 'screenshots/dress-me-failed.png') }).catch(() => {})
  for (const er of errors) console.log('  ' + er)
  process.exitCode = 1
} finally {
  await browser.close()
  server.kill()
}
