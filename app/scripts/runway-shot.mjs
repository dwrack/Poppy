// Headless check for the Runway reveal and podium on the avatar. Serves
// dist/ with `vite preview`, signs in with a throwaway local session, and
// answers every Supabase request locally with a fake squad of three and a
// round in the reveal (then a finished one for the podium). Saves
// screenshots/runway-reveal.png and screenshots/podium.png at iPhone size.
// Fails if the page logged a console error, the WebGL stage never became
// ready, or more than one canvas was ever mounted.
//
//   cd app && npm run build && node scripts/runway-shot.mjs [extraShotsDir]
//
// Nothing reaches the real project and no key is needed. Chromium comes
// from playwright-core's cache, or set CHROMIUM=/path/to/chromium.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extraDir = process.argv[2]
const PORT = Number(process.env.SHOT_PORT) || 4174

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, bad) => {
  const t = setTimeout(() => bad(new Error('preview did not start')), 60000)
  server.stdout.on('data', (d) => { if (String(d).includes('http')) { clearTimeout(t); ok() } })
  server.stderr.on('data', (d) => process.stderr.write(d))
})

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = '00000000-0000-4000-8000-000000000001'
const F1 = '00000000-0000-4000-8000-000000000002'
const F2 = '00000000-0000-4000-8000-000000000003'
const GROUP = '00000000-0000-4000-8000-00000000000a'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', exp: 4102444800 })}.sig`
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'test@example.com' } }

const h = 3_600_000
const at = (ms) => new Date(Date.now() + ms).toISOString()
const members = [
  { group_id: GROUP, user_id: USER, display_name: 'Poppy', emoji: '🌸', role: 'owner', joined_at: at(-72 * h) },
  { group_id: GROUP, user_id: F1, display_name: 'Maya', emoji: '🦋', role: 'member', joined_at: at(-70 * h) },
  { group_id: GROUP, user_id: F2, display_name: 'Zoe', emoji: '🍒', role: 'member', joined_at: at(-69 * h) },
]
// same shape round_entry_cards_v2() returns: owner_id/owner per piece (v6), colours/pattern (v4b)
const piece = (id, name, category, colours, pattern, owner = [USER, 'Poppy']) => ({ id, name, category, colours, pattern, cutout_path: `${id}.png`, owner_id: owner[0], owner: owner[1] })
const cards = [
  { entry_id: 'e1', user_id: USER, display_name: 'Poppy', emoji: '🌸', outfit: { items: ['p1', 'p2', 'p3'] }, photo_path: null, submitted_at: at(-5 * h),
    pieces: [piece('p1', 'Pink stripe tee', 'top', ['pink', 'white'], 'stripe'), piece('p2', 'Denim skirt', 'bottom', ['denim'], 'solid'), piece('p3', 'White sneakers', 'shoes', ['white'], 'solid')],
    styled_by: null, avatar: { face: 'sunny', skin: 'light', hair: 'ponytail', hair_colour: 'auburn', eyes: 'green' } },
  // Maya's look has a photo-real render (v8: photo_path is the done photo job's result, in the photoreal bucket)
  { entry_id: 'e2', user_id: F1, display_name: 'Maya', emoji: '🦋', outfit: { items: ['p4', 'p5'] }, photo_path: `${F1}/job-e2.jpg`, submitted_at: at(-4 * h),
    pieces: [piece('p4', 'Floral dress', 'dress', ['navy', 'yellow'], 'floral', [F1, 'Maya']), piece('p5', 'Green jacket', 'outerwear', ['green'], 'solid')], // jacket borrowed from Poppy
    styled_by: null, avatar: { face: 'chill', skin: 'deep', hair: 'buns', hair_colour: 'black', eyes: 'brown' } },
  { entry_id: 'e3', user_id: F2, display_name: 'Zoe', emoji: '🍒', outfit: { items: ['p6', 'p7', 'p8'] }, photo_path: null, submitted_at: at(-3 * h),
    pieces: [piece('p6', 'Red check shirt', 'top', ['red', 'black'], 'check', [F2, 'Zoe']), piece('p7', 'Black jeans', 'bottom', ['black'], 'solid', [F2, 'Zoe']), piece('p8', 'Yellow boots', 'shoes', ['yellow'], 'solid', [F2, 'Zoe'])],
    styled_by: 'Maya', avatar: null }, // no presets yet: she walks as the default look
]
const results = [
  { entry_id: 'e2', total: 14, votes: 3, chips: { 'on theme': 2, colour: 1 } },
  { entry_id: 'e1', total: 11, votes: 3, chips: { brave: 2, fit: 1 } },
  { entry_id: 'e3', total: 9, votes: 3, chips: { shoes: 3 } },
]
const revealRound = { id: 'r1', group_id: GROUP, theme: 'Rainy school day but make it cute', opens_at: at(-25 * h), closes_at: at(-1 * h), reveal_at: at(-1 * h), voting_ends_at: at(11 * h), status: 'reveal', picked_by: null }
const doneRound = { ...revealRound, id: 'r0', theme: 'Y2K', opens_at: at(-170 * h), closes_at: at(-146 * h), reveal_at: at(-146 * h), voting_ends_at: at(-134 * h), status: 'done' }
const nextRound = { ...revealRound, id: 'r2', theme: null, opens_at: at(50 * h), closes_at: at(74 * h), reveal_at: at(74 * h), voting_ends_at: at(86 * h), status: 'upcoming' }
let mode = 'reveal'

const exe = process.env.CHROMIUM || chromium.executablePath()
const browser = await chromium.launch({
  headless: true, executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ['sb-yrcddfehjjbtzwuotmym-auth-token', JSON.stringify(session)])

// Cutout PNGs drawn in a scratch page, served for the "signed" storage links.
const scratch = await ctx.newPage()
const pngs = await scratch.evaluate(() => {
  const draw = (fn) => { const c = document.createElement('canvas'); c.width = c.height = 300; fn(c.getContext('2d')); return c.toDataURL('image/png').split(',')[1] }
  const shirt = (g, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(60, 70); g.lineTo(120, 40); g.lineTo(180, 40); g.lineTo(240, 70); g.lineTo(220, 120); g.lineTo(200, 110); g.lineTo(200, 260); g.lineTo(100, 260); g.lineTo(100, 110); g.lineTo(80, 120); g.closePath(); g.fill() }
  const skirt = (g, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(110, 60); g.lineTo(190, 60); g.lineTo(240, 260); g.lineTo(60, 260); g.closePath(); g.fill() }
  const pants = (g, fill) => { g.fillStyle = fill; g.fillRect(95, 40, 50, 230); g.fillRect(155, 40, 50, 230); g.fillRect(95, 40, 110, 60) }
  const shoe = (g, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(110, 190, 70, 35, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(200, 190, 70, 35, 0, 0, Math.PI * 2); g.fill() }
  const jacket = (g, fill) => { shirt(g, fill); g.fillStyle = '#fff'; g.fillRect(142, 60, 16, 200) }
  return {
    p1: draw((g) => shirt(g, '#f08cb8')), p2: draw((g) => skirt(g, '#4a6fa0')), p3: draw((g) => shoe(g, '#f6f4f0')),
    p4: draw((g) => skirt(g, '#22304f')), p5: draw((g) => jacket(g, '#3d8a4f')),
    p6: draw((g) => shirt(g, '#c0392b')), p7: draw((g) => pants(g, '#222')), p8: draw((g) => shoe(g, '#e9c46a')),
    // a stand-in "photo": wall, floor, a girl-shaped silhouette in a navy dress and green jacket
    photo: (() => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 800
      const g = c.getContext('2d')
      g.fillStyle = '#efe6da'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#c9b79c'; g.fillRect(0, 620, 600, 180)
      g.fillStyle = '#8d5a3b'; g.beginPath(); g.arc(300, 170, 60, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#3d8a4f'; g.fillRect(220, 240, 160, 170)
      g.fillStyle = '#22304f'; g.beginPath(); g.moveTo(250, 400); g.lineTo(350, 400); g.lineTo(400, 600); g.lineTo(200, 600); g.closePath(); g.fill()
      g.fillStyle = '#8d5a3b'; g.fillRect(255, 600, 25, 60); g.fillRect(320, 600, 25, 60)
      return c.toDataURL('image/png').split(',')[1]
    })(),
  }
})
await scratch.close()

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
await ctx.route(/supabase\.co\//, (route) => {
  const u = new URL(route.request().url())
  const p = u.pathname, q = u.search
  if (p.includes('/auth/v1/user')) return json(route, {})
  if (p.includes('/storage/v1/object/sign/closet/')) {
    const id = p.split('/').pop().replace('.png', '')
    return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(pngs[id] ?? pngs.p1, 'base64') })
  }
  if (p.includes('/storage/v1/object/sign/photoreal/')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(pngs.photo, 'base64') })
  if (p.includes('/storage/v1/object/sign/photoreal')) {
    const paths = route.request().postDataJSON()?.paths ?? []
    return json(route, paths.map((path) => ({ path, signedURL: `/object/sign/photoreal/${path}?token=x` })))
  }
  if (p.includes('/storage/v1/object/sign/closet')) {
    const paths = route.request().postDataJSON()?.paths ?? []
    return json(route, paths.map((path) => ({ path, signedURL: `/object/sign/closet/${path}?token=x` })))
  }
  if (p.endsWith('/rpc/advance_rounds')) return json(route, null)
  if (p.endsWith('/rpc/round_entry_cards_v2')) return json(route, cards)
  if (p.endsWith('/rpc/round_results')) return json(route, results)
  if (p.endsWith('/rest/v1/groups')) return json(route, { id: GROUP, name: 'The Squad', owner_id: USER, tz: 'America/Chicago' })
  // my squads (one here; squads-shot.mjs covers two) with the squad embedded, or the active squad's members
  if (p.endsWith('/rest/v1/group_members')) {
    if (q.includes('user_id=eq.')) return json(route, [{ group_id: GROUP, display_name: 'Poppy', emoji: '🌸', role: 'owner', joined_at: members[0].joined_at, groups: { id: GROUP, name: 'The Squad', owner_id: USER, tz: 'America/Chicago' } }])
    return json(route, members)
  }
  if (p.endsWith('/rest/v1/rounds')) {
    if (q.includes('status=neq.done')) return json(route, [mode === 'reveal' ? revealRound : nextRound])
    if (q.includes('status=eq.done')) return json(route, mode === 'reveal' ? [] : [doneRound])
    return json(route, [])
  }
  return json(route, [])
})

const page = await ctx.newPage()
const errors = []
// the Realtime socket cannot resolve the host offline; that is the sandbox, not the app
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('realtime/v1/websocket')) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
const canvases = () => page.evaluate(() => document.querySelectorAll('canvas').length)
const shots = resolve(app, 'screenshots')
mkdirSync(shots, { recursive: true })
if (extraDir) mkdirSync(extraDir, { recursive: true })

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Closet', exact: true }).waitFor({ timeout: 15000 })
  // the avatar chunk must not have loaded for the closet
  const before = await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /avatar-vendor|AvatarScene/.test(r.name)))
  if (before) throw new Error('avatar chunk downloaded before the reveal')

  await page.getByRole('button', { name: /Runway$/ }).click()
  await page.getByText('Look 1 of 3').waitFor({ timeout: 15000 })
  // the cutout stack is the picture until she is ready
  await page.locator('[data-testid=avatar-stage] img').first().waitFor({ timeout: 10000 })
  const stage = page.locator('[data-testid=avatar-stage][data-ready="1"]')
  await stage.waitFor({ timeout: 90000 })
  if (extraDir) { await page.waitForTimeout(1500); await page.screenshot({ path: resolve(extraDir, 'reveal-walking.png') }) }
  await page.waitForTimeout(extraDir ? 5000 : 6500) // walk 3.2 s, pose, one turn, hold at 5.6 s
  await page.screenshot({ path: resolve(shots, 'runway-reveal.png') })
  if ((await canvases()) !== 1) throw new Error('expected one canvas during the reveal')

  // next girl: same canvas, new look and clothes
  await page.getByRole('button', { name: 'Next look ›' }).click()
  await page.getByText('Look 2 of 3').waitFor()
  await page.waitForTimeout(400)
  if ((await canvases()) !== 1) throw new Error('canvas count changed between looks')
  if (extraDir) { await page.waitForTimeout(6000); await page.screenshot({ path: resolve(extraDir, 'reveal-look-2.png') }) }
  await page.getByRole('button', { name: 'Next look ›' }).click()
  await page.getByText('Look 3 of 3').waitFor()
  if (extraDir) { await page.waitForTimeout(6400); await page.screenshot({ path: resolve(extraDir, 'reveal-look-3.png') }) }

  // podium: last round done, next one upcoming
  mode = 'podium'
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Runway$/ }).click()
  await page.getByText('Last round').waitFor({ timeout: 15000 })
  await stage.waitFor({ timeout: 90000 })
  // the winner (Maya) has a photo-real render: it is the picture, she stays loaded behind it
  const photo = page.locator('[data-testid=avatar-stage] [data-testid=photo-real]')
  await photo.waitFor({ timeout: 10000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: resolve(shots, 'podium.png') })
  if ((await canvases()) !== 1) throw new Error('expected one canvas on the podium')
  // tap to flip to her in 3D, and back
  await page.getByTestId('photo-flip').click()
  await photo.waitFor({ state: 'detached', timeout: 5000 })
  await page.waitForTimeout(3400) // one twirl on arrival, then the hold
  await page.screenshot({ path: resolve(shots, 'podium-3d.png') })
  await page.getByTestId('photo-flip').click()
  await photo.waitFor({ timeout: 5000 })
  if ((await page.locator('[data-testid=look-photo]').count()) < 1) throw new Error('podium card should show the photo thumbnail')
  // tap third place: she swaps in and twirls
  await page.getByRole('button', { name: 'Show Zoe on the podium' }).click()
  await page.waitForTimeout(600)
  if (extraDir) await page.screenshot({ path: resolve(extraDir, 'podium-third-twirl.png') })
  if ((await canvases()) !== 1) throw new Error('canvas count changed on the podium')

  if ((await photo.count()) !== 0) throw new Error('Zoe has no photo: the stage should show her avatar')

  console.log(`runway: reveal ok, next look ok, podium photo + flip ok, one canvas throughout, console errors: ${errors.length}`)
  for (const e of errors) console.log('  ' + e)
  if (errors.length) process.exitCode = 1
} catch (e) {
  console.error('runway check failed:', e)
  await page.screenshot({ path: resolve(shots, 'runway-failed.png') }).catch(() => {})
  for (const er of errors) console.log('  ' + er)
  process.exitCode = 1
} finally {
  await browser.close()
  server.kill()
}
