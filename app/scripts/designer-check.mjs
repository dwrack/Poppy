// Safety and quality check for the designer's notes (src/lib/designer.ts).
// The models are kids, so every note must stay on the clothes and the model's attitude.
// Generates a note for every store piece, then 300+ random looks with random themes and
// some deliberately unsafe inputs (fit, feel, names, themes, model names), and FAILS on:
// a banned word, an em dash or "--", an empty note, more than 420 characters, the wrong
// sentence count, or a note that changes between two calls with the same input.
//
//   cd app && node scripts/designer-check.mjs
//
// Node 22.18+ strips TypeScript types itself (designer.ts and stores.ts only use
// `import type`). Older Node: run with --experimental-strip-types.
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { pieceNote, lookNote } = await import(pathToFileURL(resolve(app, 'src/lib/designer.ts')).href)
const { STORES } = await import(pathToFileURL(resolve(app, 'src/lib/stores.ts')).href)

const BANNED = /\b(body|bodies|weight|weights|size|sizes|shape|shapes|figure|figures|curve|curves|curvy|leg|legs|waist|waists|hip|hips|skin|height|tall|taller|short|shorter|age|ages|aged|flattering|slimming|sexy|grown|mature|makeup|make up|make-up|skinny|thin|fat|chubby|backless|open[- ]?back|low[- ]?cut|plung\w*|deep[- ]?v|see[- ]?through|sheer|mesh|strapless|bra|bras|bralettes?|bikinis?|lingerie|corset\w*|cleavage|midriff\w*|cropped|crop|bare|naked|nude|revealing|form[- ]?fitting|hugging|cling\w*|frame|form|seductive|alluring|sultry|provocative|flirt\w*|date ?night|babes?|underwear|thong|fishnets?)\b/i
// The squad includes Dad, so a note never assumes the model is a girl (or anyone).
const PRONOUN = /\b(she|her|hers|herself|he|him|his|himself)\b/i
const DASH = /\u2014|\u2013|--/
const MAX = 420

let failures = 0
let checked = 0
const seen = new Set()
function check(kind, note, label, sentences) {
  checked++
  seen.add(note)
  const problems = []
  if (typeof note !== 'string' || !note.trim()) problems.push('empty')
  else {
    const b = note.match(BANNED)
    if (b) problems.push(`banned word "${b[0]}"`)
    const pr = note.match(PRONOUN)
    if (pr) problems.push(`pronoun "${pr[0]}"`)
    if (DASH.test(note)) problems.push('dash')
    if (note.length > MAX) problems.push(`${note.length} chars`)
    const n = note.split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length
    if (n < sentences[0] || n > sentences[1]) problems.push(`${n} sentences`)
  }
  if (problems.length) {
    failures++
    if (failures <= 25) console.log(`FAIL ${kind} [${label}]: ${problems.join(', ')}\n   ${note}`)
  }
}

// Deterministic random for the test itself.
let s = 12345
const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
const any = (a) => a[Math.floor(rnd() * a.length)]

const storePieces = STORES.flatMap((st) => st.items)
const CATS = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'hat', 'scarf', 'accessory']
const COLS = ['black', 'white', 'grey', 'navy', 'blue', 'denim', 'green', 'olive', 'brown', 'tan', 'cream', 'red', 'pink', 'orange', 'yellow', 'purple', 'multi']
const PATS = ['solid', 'stripe', 'check', 'floral', 'print', 'texture']
const FABRICS = ['tulle', 'sequin', 'velvet', 'satin', 'denim', 'chunky knit', 'fleece', 'faux fur', 'glitter', 'chiffon', 'organza', 'leather', 'nylon', 'cotton', 'woven straw', 'felt', 'lace', 'silk', 'linen', 'mystery fabric', '', undefined]
// Real looking fit and feel text, plus the nasty kind an AI describer or a kid might type.
const FITS = ['relaxed', 'cropped', 'oversized, dropped shoulders', 'high waist, wide leg', 'skinny fit', 'slim fit through the body', 'sits low on the hips', 'knee length', 'short and floaty', 'flattering on every body', 'true to size, runs small', 'tight at the waist', 'above the elbow', 'ties at the neck', 'fitted bodice, full skirt', 'cuffed ankles', 'shows a little skin', 'makes you look taller', 'for a mature look', 'A-line \u2014 midi', 'boxy -- cropped',
  'form-fitting, backless', 'see-through, strapless', 'cropped, midriff-baring', 'low-cut, plunging', 'low cut', 'sheer, lingerie', 'bodice-hugging, corset back', 'clings to her frame', 'deep v, open back', 'crop top', '', undefined]
const FEELS = ['cosy', 'sexy and grown up', 'main character energy', 'slimming and chic', 'holds a lip gloss and a secret', 'two inches closer to the stars', 'party ready', 'for ages 9 to 12', 'cute! fun.', 'Fourth of July', 'date night, clingy', 'seductive, alluring', 'flirty babe energy', 'sultry and provocative', '', undefined]
const NAMES = ['pink hoodie', 'skinny jeans', 'high waisted shorts', 'body con dress', 'slimming black tee', 'my fave leggings', 'Sparkle Top', 'shorts', 'a really really long name for a very sparkly party dress with bows', '', 'tall boots', 'Backless Lace Mini Dress', 'Plunging Sheer Bralette', 'Low Cut Date Night Top', 'See Through Mesh Bikini Cover Up', 'Strapless Corset Top']
const THEMES = ['Halloween night', 'Winter Formal', 'Red Carpet', 'Beach day', 'Spring Break', 'Pop star', 'Fairy tale', 'Space', 'Under the sea', 'Superhero', 'Pirates', 'Game day', 'Back to school', 'Rainy day', 'Valentine', '90s throwback', 'Cowgirl', 'Sleepover', 'All pink', 'Everyday', 'Grown up glam', 'Body positive', 'Mystery theme', 'Something \u2014 dashing', '', undefined]
const MODELS = ['Poppy', 'Penny', 'Ava', 'Dad', 'Shorty', 'Skinny Minnie', 'a name that is far too long to fit', '', undefined]

const randomPiece = (i) => rnd() < 0.5
  ? { ...any(storePieces), id: `${any(storePieces).id}-${i}` }
  : {
      id: `rand-${i}`,
      name: any(NAMES),
      category: any(CATS),
      colours: rnd() < 0.15 ? undefined : Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => any(COLS)),
      pattern: rnd() < 0.15 ? undefined : any(PATS),
      fabric: any(FABRICS),
      fit: any(FITS),
      feel: any(FEELS),
      formality: rnd() < 0.2 ? undefined : 1 + Math.floor(rnd() * 5),
    }

// 1. Every store piece, with and without a model name.
for (const p of storePieces) {
  for (const m of ['Poppy', undefined]) check('piece', pieceNote(p, m), `${p.id} / ${m ?? 'no model'}`, [2, 3])
  check('look1', lookNote([p], 'Poppy'), p.id, [3, 4])
}

// 2. Random pieces with messy fields.
for (let i = 0; i < 400; i++) {
  const p = randomPiece(i)
  check('piece', pieceNote(p, any(MODELS)), `${p.name} | ${p.fit} | ${p.feel}`, [2, 3])
}

// 3. 400 random looks, 1 to 8 pieces, random themes and models.
for (let i = 0; i < 400; i++) {
  const n = 1 + Math.floor(rnd() * 8)
  const look = Array.from({ length: n }, (_, k) => randomPiece(i * 10 + k))
  const theme = any(THEMES)
  const model = any(MODELS)
  const a = lookNote(look, model, theme)
  check('look', a, `${n} pieces / ${theme} / ${model}`, [3, 4])
  if (a !== lookNote(look, model, theme)) { failures++; console.log(`FAIL not deterministic: ${a}`) }
}

// 3b. Every store piece and look for Dad and for no name: no she/her anywhere (checked in check()).
for (const p of storePieces) for (const m of ['Dad', undefined]) check('piece', pieceNote(p, m), `${p.id} / ${m ?? 'no model'}`, [2, 3])
for (let i = 0; i < 200; i++) {
  const look = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, k) => randomPiece(5000 + i * 10 + k))
  check('look', lookNote(look, i % 2 ? 'Dad' : undefined, any(THEMES)), `dad/no name ${i}`, [3, 4])
}

// 4. Edge cases.
const bare = { id: 'bare', name: '', category: 'top' }
check('piece', pieceNote(bare), 'bare top', [2, 3])
check('look', lookNote([bare]), 'bare look', [3, 4])
check('look', lookNote(storePieces.slice(0, 8), undefined, 'Red Carpet'), '8 pieces no model', [3, 4])
check('look', lookNote(storePieces.slice(0, 12)), '12 pieces', [3, 4])
if (lookNote([]) !== '') { failures++; console.log('FAIL lookNote([]) should be empty') }
if (lookNote(undefined) !== '') { failures++; console.log('FAIL lookNote(undefined) should be empty') }
const two = [storePieces[0], storePieces[5]]
if (lookNote(two, 'Poppy', 'Red Carpet') === lookNote(two, 'Poppy', 'Beach day')) {
  failures++
  console.log('FAIL theme does not change the note')
}

// Variety: different looks should mostly read differently.
const variety = seen.size / checked
console.log(`\n${checked} notes checked, ${seen.size} distinct (${Math.round(variety * 100)}%)`)
if (variety < 0.6) { failures++; console.log('FAIL notes are too repetitive') }

console.log('\nSamples:')
const samples = [
  pieceNote(STORES[0].items[0], 'Poppy'),
  pieceNote(STORES[2].items[6]),
  pieceNote({ id: 'x', name: 'skinny jeans', category: 'bottom', colours: ['denim'], pattern: 'solid', fabric: 'stretch denim', fit: 'high waist, skinny fit', feel: 'everyday cool', formality: 1 }, 'Penny'),
  lookNote([STORES[0].items[0], STORES[0].items[8], STORES[0].items[9]], 'Poppy', 'Red Carpet'),
  lookNote([STORES[3].items[0], STORES[3].items[1], STORES[3].items[2], STORES[2].items[1]], 'Penny', 'Halloween'),
  lookNote(storePieces.slice(20, 28)),
]
for (const n of samples) console.log(`\n(${n.length}) ${n}`)

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll designer notes passed.')
