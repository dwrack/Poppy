// Headless check for several squads on one account. Serves dist/ with
// `vite preview`, signs in with a throwaway local session, and answers every
// Supabase request locally: Poppy is in two squads, "Poppy's Squad" (with
// Maya and Zoe) and "Rack Family" (with Penny and Dad). Checks that:
//   - the switcher shows both squads on the Squad and Runway tabs,
//   - switching swaps the members, the borrow requests and the runway, with
//     nothing from the other squad on screen,
//   - the pick survives a reload (remembered per account),
//   - the You tab's squad ladder follows it,
//   - "Start another squad" makes a third squad and switches to it, and
//     "Leave" moves back to another one.
// Saves screenshots/squad-switcher.png (Squad tab, Rack Family) and
// screenshots/squad-switcher-runway.png. Fails on any console error.
//
//   cd app && npm run build && node scripts/squads-shot.mjs
//
// Nothing reaches the real project. Chromium: same CHROMIUM trick as the others.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.SHOT_PORT) || 4176

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((ok, bad) => {
  const t = setTimeout(() => bad(new Error('preview did not start')), 20000)
  server.stdout.on('data', (d) => { if (String(d).includes('http')) { clearTimeout(t); ok() } })
  server.stderr.on('data', (d) => process.stderr.write(d))
})

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = '00000000-0000-4000-8000-000000000001'
const MAYA = '00000000-0000-4000-8000-000000000002', ZOE = '00000000-0000-4000-8000-000000000003'
const PENNY = '00000000-0000-4000-8000-000000000004', DAD = '00000000-0000-4000-8000-000000000005'
const G1 = '00000000-0000-4000-8000-00000000000a', G2 = '00000000-0000-4000-8000-00000000000b', G3 = '00000000-0000-4000-8000-00000000000c'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER, aud: 'authenticated', role: 'authenticated', email: 'poppy@example.com', exp: 4102444800 })}.sig`
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'poppy@example.com' } }

const h = 3_600_000
const at = (ms) => new Date(Date.now() + ms).toISOString()
const groups = {
  [G1]: { id: G1, name: 'Poppy’s Squad', owner_id: USER, tz: 'America/Chicago' },
  [G2]: { id: G2, name: 'Rack Family', owner_id: USER, tz: 'America/Chicago' },
}
const mine = [
  { group_id: G1, display_name: 'Poppy', emoji: '🌸', role: 'owner', joined_at: at(-900 * h) },
  { group_id: G2, display_name: 'Poppy', emoji: '🌻', role: 'owner', joined_at: at(-2 * h) },
]
const members = {
  [G1]: [
    { group_id: G1, user_id: USER, display_name: 'Poppy', emoji: '🌸', role: 'owner', joined_at: at(-900 * h) },
    { group_id: G1, user_id: MAYA, display_name: 'Maya', emoji: '🦋', role: 'member', joined_at: at(-800 * h) },
    { group_id: G1, user_id: ZOE, display_name: 'Zoe', emoji: '🍒', role: 'member', joined_at: at(-700 * h) },
  ],
  [G2]: [
    { group_id: G2, user_id: USER, display_name: 'Poppy', emoji: '🌻', role: 'owner', joined_at: at(-2 * h) },
    { group_id: G2, user_id: PENNY, display_name: 'Penny', emoji: '🐰', role: 'member', joined_at: at(-1 * h) },
    { group_id: G2, user_id: DAD, display_name: 'Dad', emoji: '🎸', role: 'member', joined_at: at(-0.5 * h) },
  ],
}
// Borrow requests to Poppy: one from Maya (squad tab), one from Zoe for G1's round, one from Penny (squad tab).
const borrows = [
  { id: 'b1', item_id: 'i1', owner_id: USER, borrower_id: MAYA, status: 'requested', needed_on: null, due_on: null, note: null, round_id: null, created_at: at(-3 * h) },
  { id: 'b3', item_id: 'i3', owner_id: USER, borrower_id: ZOE, status: 'requested', needed_on: null, due_on: null, note: null, round_id: 'r1', created_at: at(-2 * h) },
  { id: 'b2', item_id: 'i2', owner_id: USER, borrower_id: PENNY, status: 'requested', needed_on: null, due_on: null, note: null, round_id: null, created_at: at(-1 * h) },
]
const cards = { i1: 'Denim jacket', i2: 'Striped scarf', i3: 'Yellow boots' }
const roundFor = (g) => ({ id: g === G1 ? 'r1' : g === G2 ? 'r2' : 'r3', group_id: g, theme: null, opens_at: at(30 * h), closes_at: at(54 * h), reveal_at: at(54 * h), voting_ends_at: at(66 * h), status: 'upcoming', picked_by: null, season_no: null, round_no: null })
const ladder = {
  [G1]: [{ user_id: MAYA, display_name: 'Maya', emoji: '🦋', stars: 41, rounds_played: 4, wore_count: 2, streak: 2 }, { user_id: USER, display_name: 'Poppy', emoji: '🌸', stars: 38, rounds_played: 4, wore_count: 1, streak: 0 }, { user_id: ZOE, display_name: 'Zoe', emoji: '🍒', stars: 22, rounds_played: 3, wore_count: 0, streak: 0 }],
  [G2]: [{ user_id: USER, display_name: 'Poppy', emoji: '🌻', stars: 9, rounds_played: 1, wore_count: 0, streak: 0 }, { user_id: PENNY, display_name: 'Penny', emoji: '🐰', stars: 7, rounds_played: 1, wore_count: 0, streak: 0 }, { user_id: DAD, display_name: 'Dad', emoji: '🎸', stars: 4, rounds_played: 1, wore_count: 0, streak: 0 }],
}

const exe = process.env.CHROMIUM || chromium.executablePath()
const browser = await chromium.launch({ headless: true, executablePath: exe })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v) }, ['sb-yrcddfehjjbtzwuotmym-auth-token', JSON.stringify(session)])
await ctx.routeWebSocket(/supabase\.co/, () => {}) // the Realtime socket goes nowhere

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const dot = (r) => r.replace(/^(eq|in)\./, '').replace(/^\(|\)$/g, '')
await ctx.route(/supabase\.co\//, (route) => {
  const req = route.request()
  const u = new URL(req.url()), p = u.pathname, m = req.method(), q = u.searchParams
  if (p.includes('/auth/v1/user')) return json(route, {}) // no id: the closet sync stays idle
  if (p.includes('/storage/v1/object/sign/closet/')) {
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" fill="#f4a261"/></svg>' })
  }
  if (p.includes('/storage/v1/object/sign/closet')) {
    const paths = req.postDataJSON()?.paths ?? []
    return json(route, paths.map((path) => ({ path, signedURL: `/object/sign/closet/${path}?token=x` })))
  }
  if (p.endsWith('/rest/v1/group_members')) {
    if (m === 'DELETE') { // leave
      const g = dot(q.get('group_id') ?? '')
      const i = mine.findIndex((x) => x.group_id === g)
      if (i >= 0) mine.splice(i, 1)
      return route.fulfill({ status: 204, body: '' })
    }
    if (q.get('user_id')) return json(route, mine.map((x) => ({ ...x, groups: groups[x.group_id] })))
    return json(route, members[dot(q.get('group_id') ?? '')] ?? [])
  }
  if (p.endsWith('/rest/v1/rpc/create_group')) {
    const b = req.postDataJSON()
    groups[G3] = { id: G3, name: b.group_name, owner_id: USER, tz: null }
    mine.push({ group_id: G3, display_name: b.my_name, emoji: b.my_emoji, role: 'owner', joined_at: at(0) })
    members[G3] = [{ group_id: G3, user_id: USER, display_name: b.my_name, emoji: b.my_emoji, role: 'owner', joined_at: at(0) }]
    return json(route, G3)
  }
  if (p.endsWith('/rest/v1/borrow_requests')) return json(route, borrows)
  if (p.endsWith('/rest/v1/rpc/borrow_item_cards')) {
    const ids = req.postDataJSON()?.ids ?? []
    return json(route, ids.map((id) => ({ id, name: cards[id], category: 'outerwear', cutout_path: `${USER}/${id}/cutout.png`, user_id: USER })))
  }
  if (p.endsWith('/rest/v1/rounds')) {
    if (q.get('select') === 'id,group_id') return json(route, (dot(q.get('id') ?? '')).split(',').map((id) => ({ id, group_id: id === 'r1' ? G1 : id === 'r2' ? G2 : G3 })))
    const g = dot(q.get('group_id') ?? '')
    if (q.get('status') === 'neq.done') return json(route, [roundFor(g)])
    return json(route, [])
  }
  if (p.endsWith('/rest/v1/rpc/squad_ladder')) return json(route, ladder[req.postDataJSON()?.g] ?? [])
  if (p.endsWith('/rest/v1/rpc/can_pick_theme')) return json(route, false)
  if (p.includes('/rest/v1/rpc/')) return json(route, null)
  return json(route, [])
})

const page = await ctx.newPage()
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('realtime/v1/websocket')) errors.push(msg.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('dialog', (d) => void d.accept()) // "Leave Cousins?"
const shots = resolve(app, 'screenshots')
mkdirSync(shots, { recursive: true })

const switcher = page.getByTestId('squad-switcher')
const chip = (name) => switcher.getByRole('tab', { name: new RegExp(name) })
const tab = (name) => page.getByRole('button', { name: new RegExp(name + '$') }).last()
const check = (ok, msg) => { if (!ok) throw new Error(msg) }
const visible = async (text) => (await page.getByText(text, { exact: true }).count()) > 0
const absent = async (texts, where) => { for (const t of texts) check(!(await visible(t)), `${t} from the other squad showed on ${where}`) }

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Closet', exact: true }).waitFor({ timeout: 15000 })

  // Squad tab: both squads in the switcher, the first one active.
  await tab('Squad').click()
  await page.getByRole('heading', { name: 'Poppy’s Squad' }).waitFor({ timeout: 10000 })
  check(await switcher.getByRole('tab').count() === 2, 'switcher should show two squads')
  check((await chip('Poppy’s Squad').getAttribute('aria-selected')) === 'true', 'first squad should be active')
  await page.getByText('Maya wants it').waitFor()
  check(await visible('Zoe wants it · 🏆 for this week’s runway'), 'the round borrow for this squad should show')
  await absent(['Penny', 'Dad', 'Penny wants it'], 'Poppy’s Squad')

  // Switch: Rack Family's people and requests, nothing of the other squad.
  await chip('Rack Family').click()
  await page.getByRole('heading', { name: 'Rack Family' }).waitFor({ timeout: 10000 })
  await page.getByText('Penny wants it').waitFor()
  check(await visible('Dad'), 'Dad should be in Rack Family')
  await absent(['Maya', 'Zoe', 'Maya wants it', 'Zoe wants it · 🏆 for this week’s runway'], 'Rack Family')
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(shots, 'squad-switcher.png') })

  // Runway: same switcher, same squad.
  await tab('Runway').click()
  await page.getByText('Rack Family · one round a week').waitFor({ timeout: 10000 })
  check((await chip('Rack Family').getAttribute('aria-selected')) === 'true', 'runway should follow the active squad')
  await page.waitForTimeout(300)
  await page.screenshot({ path: resolve(shots, 'squad-switcher-runway.png') })

  // The pick is remembered for this account across a reload.
  await page.reload({ waitUntil: 'networkidle' })
  await tab('Runway').click()
  await page.getByText('Rack Family · one round a week').waitFor({ timeout: 10000 })
  const stored = await page.evaluate((k) => localStorage.getItem(k), `poppyseed:active-squad:${USER}`)
  check(stored === G2, 'active squad should be stored under this account')
  await chip('Poppy’s Squad').click()
  await page.getByText('Poppy’s Squad · one round a week').waitFor({ timeout: 10000 })

  // You tab: the squad ladder follows the active squad.
  await tab('You').click()
  const lad = page.getByTestId('squad-ladder')
  await lad.getByText(/^Maya ·/).waitFor({ timeout: 10000 }) // "Maya · Trendsetter"
  check((await lad.getByRole('heading').innerText()) === 'Poppy’s Squad', 'ladder should show the active squad')
  check(!(await lad.getByText(/Penny|Dad/).count()), 'Rack Family ladder rows leaked into Poppy’s Squad')

  // Start another squad: it is made and becomes the active one.
  await tab('Squad').click()
  await page.getByRole('button', { name: '＋ Start another squad' }).click()
  await page.getByPlaceholder('The Fit Check Club').fill('Cousins')
  check(!(await page.getByPlaceholder('Poppy').count()), 'no name to type when you already have a squad')
  await page.getByRole('button', { name: '🦊', exact: true }).click()
  await page.getByRole('button', { name: 'Create squad' }).click()
  await page.getByRole('heading', { name: 'Cousins' }).waitFor({ timeout: 10000 })
  check(await switcher.getByRole('tab').count() === 3, 'three squads after starting one')
  await absent(['Maya', 'Penny', 'Dad'], 'the new squad')

  // Leave it: back to another squad.
  await page.getByRole('button', { name: 'Leave Cousins' }).click()
  await page.getByRole('heading', { name: 'Poppy’s Squad' }).waitFor({ timeout: 10000 })
  check(await switcher.getByRole('tab').count() === 2, 'two squads after leaving one')

  console.log(`squads: switcher on Squad + Runway, members/requests/runway/ladder follow the active squad with nothing leaking, pick survives reload, start + leave ok, console errors: ${errors.length}`)
  for (const e of errors) console.log('  ' + e)
  if (errors.length) process.exitCode = 1
} catch (e) {
  console.error('squads check failed:', e)
  await page.screenshot({ path: resolve(shots, 'squads-failed.png') }).catch(() => {})
  for (const er of errors) console.log('  ' + er)
  process.exitCode = 1
} finally {
  await browser.close()
  server.kill()
}
