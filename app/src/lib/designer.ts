// Designer's notes: a warm, dramatic fashion designer talking backstage about the clothes
// and how they look on the model. Pure, no network, deterministic: the same pieces (and
// theme) always get the same note, different looks get different notes.
//
// SAFETY: the models are kids (9 to 12). Notes talk only about the garments (cut, fabric,
// colour, movement, construction, styling, how pieces work together) and the model's
// attitude, confidence, walk, pose, energy and choices. Nothing about bodies, ever. Text
// that comes from a piece (its name, fit, feel) or a round theme is scrubbed first, so a
// fit like "sits low on the hips" can never reach the screen. scripts/designer-check.mjs
// generates thousands of notes and fails on any banned word.
import type { Category, Colour, Pattern } from '../types'

export type NotePiece = {
  id: string
  name: string
  category: Category
  colours?: Colour[]
  pattern?: Pattern
  fabric?: string
  fit?: string
  feel?: string
  formality?: number
}

/* ---------- seeded picks ---------- */

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

type Rand = () => number
function seeded(seed: string): Rand {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: Rand, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length]

/* ---------- scrubbing outside text ---------- */

// Grown-up garment and mood words a shop title or an AI describer can carry in. A piece name with
// one of these is never repeated at all (the note says "dress", "top"), and a fit or feel clause
// with one is dropped.
const ADULT_WORDS = [
      'backless', 'open[- ]?back(ed)?', 'low[- ]?cut', 'plung(e|es|ing)', 'deep[- ]?v', 'see[- ]?through', 'sheer',
      'mesh', 'strapless', 'spaghetti', 'bra', 'bras', 'bralettes?', 'bikinis?', 'lingerie', 'corset(ed|s)?',
      'cleavage', 'midriff', 'navel', 'bare', 'barely', 'exposed', 'naked', 'nude', 'skimpy', 'slit',
      'form[- ]?fitting', 'figure[- ]?hugging', 'hugging', 'cling(y|s|ing)?', 'frame', 'form', 'busty',
      'voluptuous', 'hourglass', 'toned', 'seductive', 'seduce', 'alluring', 'sultry', 'provocative', 'racy',
      'risque', 'steamy', 'flirt(y|ty|ing)?', 'date ?night', 'dates?', 'dating', 'babes?', 'boudoir', 'negligee',
      'thong', 'garters?', 'stockings', 'fishnets?', 'underwear', 'undies', 'panties', 'boyfriend', 'girlfriend',
]
// A note never guesses who the model is (Dad walks too), so outside text with a pronoun goes.
const PRONOUNS = ['she', 'her', 'hers', 'herself', 'he', 'him', 'his', 'himself']
const ADULT = new RegExp('\\b(' + ADULT_WORDS.join('|') + ')\\b', 'i')

// Anything that talks about a body, a number on a body, or grown-up beauty. Matched as whole words.
const UNSAFE = new RegExp(
  '\\b(' +
    [
      'bod(y|ies)', 'weigh(t|ts|s|ed)?', 'sizes?', 'sized', 'shape[ds]?', 'shapely', 'figures?', 'curv(e|es|y|ed)',
      'legs?', 'leggy', 'waist(ed|line|band)?', 'hips?', 'skin', 'height', 'tall(er)?', 'short(er)?', 'ages?', 'aged',
      'flatter(ing|s)?', 'slim(ming|s)?', 'sexy', 'grown', 'mature', 'make ?up', 'skinny', 'thin(ner)?', 'fat',
      'chubby', 'petite', 'plus', 'torso', 'tumm(y|ies)', 'belly', 'bust', 'chest', 'thighs?', 'bum', 'butt',
      'knees?', 'elbows?', 'shoulders?', 'ankles?', 'neck(line)?', 'arms?', 'lips?', 'gloss', 'lipstick',
      'mascara', 'eyeliner', 'inch(es)?', 'lbs?', 'pounds?', 'kilos?', 'diet', 'revealing', 'tight', 'teens?',
      'years?', 'lady', 'ladies', 'wom[ae]n', 'adults?', 'hot', 'baby',
      ...ADULT_WORDS, ...PRONOUNS,
    ].join('|') +
    ')\\b',
  'i',
)

// The same words, every match at once: a multi-word phrase ("low cut", "date night") goes as a whole.
const UNSAFE_ALL = new RegExp(UNSAFE.source, 'gi')

// Garment wording that names a body part, rewritten into plain construction words first.
const REWRITES: [RegExp, string][] = [
  [/\bbody[- ]?con\b/gi, 'stretch'],
  [/\bcrop(ped)?( top)?\b/gi, 'boxy$2'],
  [/\bsheer\b/gi, 'airy'],
  [/\bin (\w+ )?form\b/gi, 'in $1style'],
  [/\b(high|mid|low)[- ]?(waist(ed)?|rise)\b/gi, '$1 rise'],
  [/\b(sits?|sitting|worn) low on the hips?\b/gi, 'sits low and easy'],
  [/\b(at|on|to) the hips?\b/gi, 'at the side'],
  [/\b(at|to|above|below|past) the knees?\b|\bknee[- ]length\b/gi, 'midi length'],
  [/\b(above|at|past|to) the elbows?\b/gi, 'opera length'],
  [/\bwraps?( around)? the shoulders\b/gi, 'wraps around like a hug'],
  [/\boff[- ]the[- ]shoulders?\b|\boff[- ]shoulder\b/gi, 'bardot cut'],
  [/\bties? (at|around) the neck\b/gi, 'ties in a bow'],
  [/\bankle[- ]straps?\b/gi, 'buckle strap'],
  [/\bcuffed ankles?\b/gi, 'cuffed hems'],
  [/\bover the ears\b/gi, 'snug and cosy'],
  [/\bshort[- ]sleeved?s?\b/gi, 'little sleeves'],
  [/\bslim[- ]?fit\b/gi, 'neat fit'],
  [/\bskinny\b/gi, 'straight'],
  [/\btall\b/gi, 'towering'],
  [/\bshort\b/gi, 'mini'],
]

const tidy = (s: string) =>
  s.replace(/\s*(\u2014|\u2013|--)\s*/g, ', ').replace(/[.!?;"]/g, ' ').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim()

const clip = (s: string, max: number) => {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[,:\s]+$/, '')
}

function rewrite(s: string) {
  let out = s
  for (const [re, to] of REWRITES) out = out.replace(re, to)
  return out
}

/** A fit or feel line: keep only the clauses that are safe after rewriting, at most two, kept short. */
function safeClauses(text: string | undefined, max = 46): string {
  if (!text) return ''
  const clauses = tidy(text)
    .split(/\s*,\s*/)
    .map((c) => rewrite(c).trim())
    .filter((c) => c && !UNSAFE.test(c))
  let out = ''
  for (const c of clauses.slice(0, 2)) {
    const next = out ? `${out}, ${c}` : c
    if (next.length > max && out) break
    out = next
  }
  return clip(out, max)
}

/** A piece's own fit or fabric line made safe to print next to a note (same rules as the notes). */
export function cleanFit(text: string | undefined): string {
  return safeClauses(text, 80)
}

const NOUN: Record<Category, string> = {
  top: 'top', bottom: 'bottoms', dress: 'dress', outerwear: 'jacket', shoes: 'shoes',
  bag: 'bag', hat: 'hat', scarf: 'scarf', accessory: 'accessory',
}

/** A piece name with any unsafe word taken out (never invented). Falls back to the category noun. */
function safeName(p: NotePiece): string {
  if (ADULT.test(p.name ?? '')) return NOUN[p.category] ?? 'piece'
  const words = rewrite(tidy(p.name ?? '').replace(/,/g, ' ')).replace(UNSAFE_ALL, ' ').split(' ').filter((w) => w && !UNSAFE.test(w))
  const name = clip(words.join(' '), 32).replace(/(\s+\b(a|an|the|for|with|and|of|in|on|to|my)\b)+$/i, '')
  return name.replace(/[^a-z0-9]/gi, '') ? name : NOUN[p.category] ?? 'piece'
}

function safeModel(model?: string): string {
  let m = tidy(model ?? '').replace(/,/g, ' ')
  if (m.length > 20) m = m.split(' ')[0].length >= 2 ? clip(m.split(' ')[0], 20) : ''
  if (!m || UNSAFE.test(m) || !/[a-z]/i.test(m)) return 'our model'
  return m
}

function safeTheme(theme?: string): string {
  const t = clip(tidy(theme ?? '').replace(/,/g, ' '), 40)
  if (!t || /^everyday$/i.test(t)) return ''
  return UNSAFE.test(t) ? 'tonight’s theme' : t
}

const PLURAL_END = /(shoes|boots|sneakers|heels|flats|slippers|sandals|trainers|pants|shorts|jeans|trousers|leggings|joggers|overalls|tights|socks|gloves|mittens|sunglasses|glasses|wings|ears|earmuffs|earrings|bottoms|pyjamas|pajamas|cargos)$/i
const isPlural = (name: string, cat: Category) => PLURAL_END.test(name.trim()) || (cat === 'shoes' && /s$/i.test(name.trim()))

/* ---------- vocabulary ---------- */

const COLOUR_WORD: Record<Colour, string> = {
  black: 'black', white: 'white', grey: 'silver grey', navy: 'deep navy', blue: 'blue', denim: 'denim blue',
  green: 'green', olive: 'olive', brown: 'chocolate brown', tan: 'warm tan', cream: 'cream', red: 'red',
  pink: 'pink', orange: 'orange', yellow: 'sunny yellow', purple: 'purple', multi: 'rainbow',
}
const WARM: Colour[] = ['red', 'pink', 'orange', 'yellow']
const COOL: Colour[] = ['blue', 'navy', 'denim', 'green', 'purple']
const NEUTRAL: Colour[] = ['black', 'white', 'grey', 'cream', 'tan', 'brown', 'olive']

// Fabric behaviour lines. {m} is the model. Order matters: first match wins.
const FABRICS: [RegExp, string[]][] = [
  [/sequin|paillette/i, [
    'the sequins throw light around the room every time {m} turns',
    'every sequin catches the spotlight, so {m} basically glitters on the beat',
    'the sequins ripple like water when {m} moves, and the cameras love it',
    'those sequins flip and flash with every step {m} takes',
  ]],
  [/holo|iridescent|pearlescent/i, [
    'the holographic finish shifts colour every time {m} turns',
    'it flashes from pink to blue to silver as {m} walks, like a little light show',
    'the shine changes with every angle, so {m} gets a new look on every pose',
  ]],
  [/glitter|sparkle|lurex|metallic|foil|lam[eé]\b/i, [
    'the sparkle picks up every light in the room and {m} knows it',
    'it shimmers on every turn, so {m} never has to try to be seen',
    'that shine is pure stage lighting, and {m} walks right into it',
  ]],
  [/tulle|tutu/i, [
    'the tulle catches the light every time {m} turns',
    'all that tulle floats a beat behind {m}, like it is still deciding where to land',
    'layer after layer of tulle puffs up with every step {m} takes',
    'the tulle gives {m} a little cloud to walk in',
  ]],
  [/organza/i, [
    'the organza holds those crisp, airy folds while {m} moves',
    'the organza is airy and crisp, so it catches the light like frosted glass around {m}',
    'every ruffle of organza bounces on the walk and settles back like it was planned',
  ]],
  [/chiffon|georgette|voile/i, [
    'the chiffon floats out behind {m} like a soft breeze came along for the walk',
    'the chiffon moves half a second after {m} does, which is the whole magic',
    'light, floaty chiffon that drifts every time {m} pauses for a pose',
  ]],
  [/velvet|velour/i, [
    'the velvet drinks up the light and glows a deeper colour on every turn',
    'velvet like this looks rich from across the room, and {m} carries it with total calm',
    'the velvet has that soft, deep glow that makes {m} look like a movie poster',
  ]],
  [/satin|silk|charmeuse/i, [
    'the satin has a liquid shine that pours down the runway with {m}',
    'that satin catches a soft gleam every time {m} turns',
    'the satin is smooth and glossy, so each pose {m} hits looks polished',
  ]],
  [/lace|crochet|eyelet/i, [
    'the lace is all tiny details, the kind you only notice when {m} slows down',
    'the lace adds a delicate, handmade feel that {m} keeps light and fresh',
  ]],
  [/faux fur|fur\b|furry|fluffy|fuzzy|sherpa|teddy|shearling/i, [
    'the faux fur is so plush it makes {m} look like winter royalty',
    'that fluffy texture is impossible not to want to touch, and {m} plays it up',
    'the faux fur adds instant glamour, and {m} wears it like a movie star',
  ]],
  [/fleece|sweatshirt|terry|hoodie/i, [
    'soft fleece like this says comfort, and {m} still makes it look like a runway piece',
    'the fleece is cosy and relaxed, and {m} gives it serious attitude',
  ]],
  [/knit|wool|cashmere|sweater|cardigan|cable/i, [
    'the knit has that cosy, hand-made texture that looks great up close',
    'a chunky knit like this feels like a hug, and {m} makes it look effortless',
    'the knit texture gives the look warmth and depth, even under bright lights',
  ]],
  [/denim|chambray/i, [
    'denim is a classic for a reason, and {m} gives it a fresh, confident spin',
    'the denim brings that easy, cool-kid energy {m} does so well',
    'good denim never tries too hard, and {m} wears it the same way',
  ]],
  [/leather|pleather|vinyl|patent|pvc/i, [
    'that glossy finish catches the light and gives {m} a little rock star edge',
    'the leather-look shine adds edge, and {m} leans right into it',
    'it is glossy and bold, so every move {m} makes looks sharp',
  ]],
  [/nylon|puffer|quilted|parachute|windbreaker|ripstop/i, [
    'the nylon has a sporty swish and a sheen that looks great on the move',
    'the puffy quilting adds volume and fun, and {m} walks like the concert starts in five minutes',
    'that crisp nylon swishes with every step, which is half the fun',
  ]],
  [/straw|raffia|wicker|rattan/i, [
    'the woven straw has that sunny, holiday texture that {m} carries with ease',
    'the straw weave casts the softest little shadow pattern, very summer, very chic',
  ]],
  [/felt/i, [
    'the felt holds a crisp, bold outline, so {m} can strike any pose and it stays perfect',
    'felt like this keeps its crisp lines all night, which means {m} can just have fun',
  ]],
  [/crystal|gem|rhinestone|jewel|metal|chain|gold|silver/i, [
    'the crystals catch every light, so {m} sparkles even standing still',
    'that shine is jewellery level, and {m} wears it with total calm',
    'it glints on every turn, a tiny spotlight that follows {m}',
  ]],
  [/pearl|bead/i, [
    'the pearls give the look a sweet, classic glow',
    'those little pearls catch the light softly, very old Hollywood',
  ]],
  [/cotton|jersey|poplin|gauze|linen|twill|canvas|chino|corduroy|flannel/i, [
    'the fabric is easy and breezy, so {m} moves like it is the first day of holiday',
    'it is soft and simple, which lets the colour and the cut do the talking',
    'the fabric keeps it relaxed, and {m} adds the drama with that walk',
  ]],
  [/plastic|acrylic|resin/i, [
    'the glossy finish is pure pop art, and {m} wears it like a headliner',
    'it is bold, shiny and a little bit cartoon, which is exactly right on {m}',
  ]],
]

const CATEGORY_LINES: Record<Category, string[]> = {
  top: [
    'it does a lot of talking for one piece, and {m} keeps it front and centre',
    'it frames the whole outfit, and {m} wears it with real ease',
  ],
  bottom: [
    'it gives the whole look a strong base, and every stride shows off the cut',
    'it is the quiet hero of the outfit, holding everything together while {m} walks',
  ],
  dress: [
    'the dress moves with {m} instead of just hanging there',
    'one piece and the whole look is done, which leaves {m} free to work the runway',
  ],
  outerwear: [
    'it makes an entrance before {m} even reaches the end of the runway',
    'it is the first thing you see and the last thing you forget, and {m} knows how to swing it',
  ],
  shoes: [
    'they set the rhythm of the whole walk, and {m} keeps every step on the beat',
    'every step lands with a little extra attitude',
  ],
  bag: [
    'it is the tiny detail that makes the whole look feel finished',
    'it swings just right as {m} walks, a perfect little punctuation mark',
  ],
  hat: [
    'it crowns the look, and {m} tilts it at exactly the right angle',
    'it frames the whole pose and gives {m} instant character',
  ],
  scarf: [
    'it adds movement every time {m} turns',
    'it drapes and swings with the walk, so the look never sits still',
  ],
  accessory: [
    'it is the finishing touch photographers zoom in on',
    'it is a small detail with big personality, just like the way {m} styled it',
  ],
}

const PATTERN_LINES: Record<Pattern, string[]> = {
  solid: [
    'Keeping it one solid colour lets the cut speak, and {m} lets it.',
    'A clean, solid colour like this is all confidence, nothing to hide behind.',
  ],
  stripe: [
    'The stripes keep the eye moving, which suits the way {m} walks.',
    'Stripes are a bold graphic choice, and {m} wears them like a personal signature.',
  ],
  check: [
    'The check pattern is crisp and graphic, a little bit cool kid, a little bit classic.',
    'Checks always look sharp on the runway, and {m} keeps them playful.',
  ],
  floral: [
    'The florals bring a garden-party sweetness that {m} makes look fresh, not fussy.',
    'Those flowers are pure sunshine, and {m} carries them with a big smile.',
  ],
  print: [
    'The print is full of personality, and {m} matches it beat for beat.',
    'A print like this is a conversation starter, and {m} is ready to talk about it.',
  ],
  texture: [
    'All that texture makes the piece look amazing up close and from the back row.',
    'The texture adds depth, so the light plays across it with every move {m} makes.',
  ],
}

const COLOUR_LINES = [
  'That {col} is a confident choice, and {m} owns it.',
  'The {col} pops under the lights, and {m} lets it lead.',
  'I love the {col} here, it gives the whole piece a happy glow.',
  'The {col} is doing gorgeous things on the runway tonight.',
]

const FORMALITY_LINES: Record<'high' | 'mid' | 'low', string[]> = {
  high: [
    'This is a red carpet piece, so {m} should hold every pose an extra second.',
    'It is pure occasion dressing, and {m} treats the runway like a grand staircase.',
    'Very gala, very glamorous, and {m} wears it with total ease.',
  ],
  mid: [
    'Dressed up but still fun, the sweet spot I always aim for.',
    'It works for a party and still feels like {m}, which is the real test.',
  ],
  low: [
    'Easy and everyday, and still full of personality.',
    'Casual, comfy and cool, proof that relaxed can still be runway.',
    'It is laid back in the best way, and {m} makes it look styled, not thrown on.',
  ],
}

const ATTITUDE = [
  '{M} hits the end of the runway, holds the pose, and does not rush a second of it.',
  'That walk is pure confidence, and the clothes know it.',
  'Big energy, sharp choices, and a pose I would put on a magazine cover.',
  '{M} owns the runway like the whole show was booked just for this walk.',
  'Honestly, the confidence is the best accessory in this look.',
  'I would book {m} for my next show on that final turn alone.',
  'Bravo, the attitude matches the outfit, and that is the whole secret.',
  'Every choice here feels deliberate, and that is what makes a stylist.',
  '{M} styled this with a real point of view, and I am taking notes.',
  'That final spin was iconic, and the front row felt it.',
]

const PIECE_OPENERS = [
  'Look at the {n}: {fab}.',
  'I adore {this} {n}, because {fab}.',
  '{The} {n} {is} pure drama, and {fab}.',
  'Here is why I love {this} {n}: {fab}.',
  'Backstage everyone wanted a closer look at {the} {n}, and I get it, {fab}.',
  'On {m}, {the} {n} {is} a moment, {fab}.',
  'Darling, {the} {n} {is} a showstopper, {fab}.',
]

const FIT_FEEL = [
  'The cut is {fit}, and the vibe is {feel}.',
  'With {fit}, the whole story is {feel}, and {m} plays it perfectly.',
  'I love the construction, {fit}, and the mood is {feel}.',
  'It is {fit}, and {m} gives it that {feel} feeling.',
]
const FIT_ONLY = [
  'The cut is {fit}, which gives {m} room to move and a clean line on every turn.',
  'That detail, {fit}, is doing quiet work, and {m} knows exactly how to show it off.',
  'I love the construction here: {fit}, simple and smart.',
]
const FEEL_ONLY = [
  'The vibe is {feel}, and {m} walks like that was the plan all along.',
  'The whole mood is {feel}, and {m} commits to it.',
  'I would call it {feel}, and so would the front row.',
]

const LOOK_INTROS_THEME = [
  'For the {t} theme, {m} stepped out in {list}.',
  'The theme was {t}, and {m} answered with {list}.',
  '{M} took {t} and made it personal with {list}.',
  'For {t}, {m} brought {list} to the runway.',
]
const LOOK_INTROS = [
  '{M} stepped out in {list}.',
  'Here comes {m} in {list}.',
  'Tonight {m} is wearing {list}.',
  '{M} hit the runway in {list}.',
]
const HERO_LINES = [
  '{The} {n} steals the show: {fab}.',
  'My eye goes straight to {the} {n}, because {fab}.',
  'The star is {the} {n}, {fab}.',
  'Watch {the} {n}, {fab}.',
]

// Theme words to a backstage line about the theme.
const THEMES: [RegExp, string[]][] = [
  [/hallowe?en|spooky|witch|monster|pumpkin|haunt|ghost|vampire|bat\b|skeleton|trick or treat/i, [
    'Spooky, sweet and exactly the right amount of mischief for {t}.',
    'It is a little bit eerie, a lot of fun, and totally on theme.',
  ]],
  [/winter|snow|holiday|christmas|frost|ice\b|icy|cocoa|festive|new year/i, [
    'Pure winter wonderland, cosy and sparkly in the same breath.',
    'It feels like the first snow day of the year, and that is a compliment.',
  ]],
  [/red carpet|gala|premiere|oscar|hollywood|formal|award|ball\b|prom|black tie|movie star|celebrity/i, [
    'Red carpet ready, and {m} gave the photographers every angle they wanted.',
    'This is the look the cameras will be talking about after the premiere.',
  ]],
  [/beach|summer|sun\b|sunny|tropical|pool|island|vacation|holiday|surf|seaside/i, [
    'It feels like sunshine and salt air, the perfect summer story.',
    'Very beach day, very bright, and so easy to love.',
  ]],
  [/spring|flower|floral|garden|bloom|picnic|blossom|easter/i, [
    'Fresh, bright and blooming, it is spring you can wear.',
    'It feels like a picnic on the first warm day, light and happy.',
  ]],
  [/pop|rock|concert|music|tour|disco|dance|idol|band|k-?pop|festival|dj/i, [
    'Headliner energy, the kind that makes the whole crowd sing along.',
    'That is a stage look, ready for the encore.',
  ]],
  [/princess|fairy|fantasy|magic|royal|unicorn|dragon|castle|queen|storybook|fairytale|wizard/i, [
    'Straight out of a storybook, with {m} as the hero of the final chapter.',
    'Pure magic, the kind of look that belongs in a castle ballroom.',
  ]],
  [/space|galaxy|astronaut|future|futur|robot|cyber|alien|planet|star wars/i, [
    'Out of this world, and I mean that as the highest compliment.',
    'It looks like the future arrived early, and it has great taste.',
  ]],
  [/ocean|sea\b|mermaid|underwater|under the sea|shell/i, [
    'Making waves, literally and fashionably.',
    'Mermaid chic, shimmering like the ocean on a bright day.',
  ]],
  [/superhero|hero|villain|comic/i, [
    'Saving the day, one runway at a time.',
    'Every superhero needs a signature look, and this is it.',
  ]],
  [/pirate|treasure|sailor|nautical/i, [
    'Captain of the catwalk, no map required.',
    'Full of adventure, very treasure hunt chic.',
  ]],
  [/sport|athletic|team|game day|olympic|soccer|tennis|gym/i, [
    'Game day energy, ready to win the whole season.',
    'Sporty, sharp and built for a victory lap.',
  ]],
  [/school|class|book|library|study/i, [
    'Top of the class in style.',
    'Smart, polished and ready for the first day of school.',
  ]],
  [/rain|cloud|storm|puddle/i, [
    'Grey skies do not stand a chance with this much colour on the runway.',
    'It turns a grey sky into the brightest part of the day.',
  ]],
  [/love|valentine|heart|friendship|bff/i, [
    'Full of heart and impossible not to smile at.',
    'Sweet as a valentine and twice as bold.',
  ]],
  [/retro|vintage|80s|90s|70s|60s|throwback|y2k|disco/i, [
    'A throwback with a fresh twist, and it feels brand new on {m}.',
    'Totally retro, totally now, which is the trick.',
  ]],
  [/western|cowgirl|country|ranch|rodeo/i, [
    'Yeehaw, but make it couture.',
    'Rodeo ready and runway polished at the same time.',
  ]],
  [/pajama|pyjama|sleepover|cosy|cozy|comfy|slumber/i, [
    'Comfy and cute, sleepover chic at its finest.',
    'The cosiest look on the runway, and somehow the coolest too.',
  ]],
  [/monochrome|all black|all white|all pink|one colou?r|matching/i, [
    'One colour story, told with total confidence.',
    'Matching every single piece takes nerve, and {m} has plenty.',
  ]],
]
const THEME_FALLBACK = [
  'It nails {t} without trying too hard, which is the hardest thing to do.',
  'That is {t}, told with real personality, and I love every second of it.',
  'On theme and totally original at the same time.',
]

/* ---------- assembly ---------- */

const NUMBER = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const MAX = 420

type Prepared = {
  p: NotePiece
  name: string
  plural: boolean
  fit: string
  feel: string
  fabricKey: number // index in FABRICS, -1 when none
}

function prepare(p: NotePiece): Prepared {
  const name = safeName(p)
  const fabricText = `${p.fabric ?? ''} ${p.name ?? ''}`
  const fabricKey = FABRICS.findIndex(([re]) => re.test(fabricText))
  return { p, name, plural: isPlural(name, p.category), fit: safeClauses(p.fit), feel: safeClauses(p.feel, 40), fabricKey }
}

function fill(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function finish(sentences: string[]): string {
  return sentences
    .map((s) => cap(s.replace(/\s+/g, ' ').replace(/\s+([,.:!?])/g, '$1').trim()))
    .filter(Boolean)
    .join(' ')
}

function pieceVars(x: Prepared, m: string): Record<string, string> {
  return {
    m, M: cap(m), n: x.name,
    the: 'the', The: 'The', this: x.plural ? 'these' : 'this',
    is: x.plural ? 'are' : 'is',
    fit: x.fit, feel: x.feel,
  }
}

function fabricLine(r: Rand, x: Prepared, m: string): string {
  const bank = x.fabricKey >= 0 ? FABRICS[x.fabricKey][1] : CATEGORY_LINES[x.p.category] ?? CATEGORY_LINES.accessory
  let line = fill(pick(r, bank), { m })
  // Category lines about the piece itself ("it", "they") need the right pronoun.
  if (x.plural) line = line.replace(/^it is\b/, 'they are').replace(/^it\b/, 'they')
  return line
}

function fitFeelLine(r: Rand, x: Prepared, m: string): string {
  const vars = { m, M: cap(m), fit: x.fit, feel: x.feel }
  if (x.fit && x.feel) return fill(pick(r, FIT_FEEL), vars)
  if (x.fit) return fill(pick(r, FIT_ONLY), vars)
  if (x.feel) return fill(pick(r, FEEL_ONLY), vars)
  return ''
}

function formalityBand(f?: number): 'high' | 'mid' | 'low' | undefined {
  if (typeof f !== 'number' || !Number.isFinite(f)) return undefined
  return f >= 4.5 ? 'high' : f >= 3 ? 'mid' : 'low'
}

function stylingLine(r: Rand, x: Prepared, m: string): string {
  const options: string[] = []
  const colours = (x.p.colours ?? []).filter((c) => COLOUR_WORD[c])
  if (colours.length) options.push(fill(pick(r, COLOUR_LINES), { m, col: COLOUR_WORD[pick(r, colours)] }))
  if (x.p.pattern && PATTERN_LINES[x.p.pattern]) options.push(fill(pick(r, PATTERN_LINES[x.p.pattern]), { m }))
  const band = formalityBand(x.p.formality)
  if (band) options.push(fill(pick(r, FORMALITY_LINES[band]), { m }))
  options.push(fill(pick(r, ATTITUDE), { m, M: cap(m) }))
  return pick(r, options)
}

/** Drop optional sentences (by index, in order) until the note fits. */
function fit420(sentences: string[], optional: number[]): string {
  let out = finish(sentences)
  const keep = sentences.slice()
  for (const i of optional) {
    if (out.length <= MAX) break
    keep[i] = ''
    out = finish(keep)
  }
  return out.length <= MAX ? out : clip(out, MAX - 1).replace(/[,:\s]+$/, '') + '.'
}

/** 2 to 3 sentences about one piece on the model. */
export function pieceNote(piece: NotePiece, model?: string): string {
  if (!piece) return ''
  const m = safeModel(model)
  const r = seeded(`piece|${piece.id ?? ''}|${piece.name ?? ''}`)
  const x = prepare(piece)
  const s1 = fill(pick(r, PIECE_OPENERS), { ...pieceVars(x, m), fab: fabricLine(r, x, m) })
  const s2 = fitFeelLine(r, x, m) || stylingLine(r, x, m)
  let s3 = stylingLine(r, x, m)
  if (s3 === s2) s3 = fill(pick(r, ATTITUDE), { m, M: cap(m) })
  if (s3 === s2) s3 = ''
  return fit420([s1, s2, s3], [2])
}

function listOf(xs: Prepared[]): string {
  const named = xs.slice(0, 3).map((x) => `the ${x.name}`)
  const rest = xs.length - named.length
  if (rest > 0) return `${named.join(', ')} and ${NUMBER[rest] ?? rest} more finishing touch${rest === 1 ? '' : 'es'}`
  if (named.length === 1) return named[0]
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`
}

function heroOf(r: Rand, xs: Prepared[]): Prepared {
  let best = xs[0]
  let bestScore = -1
  for (const x of xs) {
    const score = (x.fabricKey >= 0 ? 3 : 0) + (x.p.formality ?? 2) + (x.p.category === 'dress' || x.p.category === 'outerwear' ? 1 : 0) + r() * 2
    if (score > bestScore) { best = x; bestScore = score }
  }
  return best
}

function comboLine(r: Rand, xs: Prepared[], hero: Prepared, m: string): string {
  const all = xs.flatMap((x) => x.p.colours ?? []).filter((c) => COLOUR_WORD[c])
  const set = [...new Set(all)]
  const warm = set.some((c) => WARM.includes(c))
  const cool = set.some((c) => COOL.includes(c))
  const neutralOnly = set.length > 0 && set.every((c) => NEUTRAL.includes(c))
  const patterned = xs.filter((x) => x.p.pattern && x.p.pattern !== 'solid' && x.p.pattern !== 'texture')
  const forms = xs.map((x) => x.p.formality).filter((f): f is number => typeof f === 'number')
  const fancy = xs.find((x) => (x.p.formality ?? 0) >= 4)
  const casual = xs.find((x) => typeof x.p.formality === 'number' && x.p.formality <= 2)
  const options: string[] = []
  const M = cap(m)
  if (set.length === 1) options.push(pick(r, [
    `Keeping everything in ${COLOUR_WORD[set[0]]} turns the whole look into one big, bold idea.`,
    `All ${COLOUR_WORD[set[0]]}, every piece, takes nerve, and ${m} has plenty.`,
  ]))
  if (set.includes('multi')) options.push(pick(r, [
    'With that much colour in play, the trick is confidence, and there is plenty of it here.',
    `The rainbow brings the party, and ${m} keeps the rest of the look in tune with it.`,
  ]))
  if (warm && cool) options.push(pick(r, [
    `Mixing warm and cool colours like this is a brave call, and ${m} pulls it off.`,
    'The warm and cool shades bounce off each other, so the look never goes flat.',
  ]))
  if (neutralOnly) options.push(pick(r, [
    'Sticking to neutrals keeps it chic, so the textures and the walk do the talking.',
    'A quiet colour story like this is very Parisian chic, and it lets every detail show.',
  ]))
  if (patterned.length >= 2) options.push(pick(r, [
    `Pattern on pattern is my favourite kind of risk, and ${m} commits to it completely.`,
    'Two patterns in one look should be chaos, and instead it is a party.',
  ]))
  if (patterned.length === 1 && xs.length > 1) options.push(
    `The ${patterned[0].p.pattern === 'floral' ? 'florals' : patterned[0].p.pattern === 'stripe' ? 'stripes' : patterned[0].p.pattern === 'check' ? 'checks' : 'print'} on the ${patterned[0].name} do the talking while everything else lets them shine.`,
  )
  if (fancy && casual && fancy !== casual && forms.length >= 2) options.push(pick(r, [
    `Pairing the ${fancy.name} with the ${casual.name} is my favourite kind of rule breaking.`,
    `Fancy ${fancy.name}, easy ${casual.name}, and somehow it all makes perfect sense on ${m}.`,
  ]))
  const other = xs.find((x) => x !== hero)
  if (other) options.push(pick(r, [
    `The ${other.name} backs up the ${hero.name} without stealing the spotlight.`,
    'Every piece has a job here, and none of them fight for attention.',
    `${M} balanced the whole thing so well, nothing feels like too much.`,
  ]))
  if (hero.fit || hero.feel) options.push(fitFeelLine(r, hero, m))
  return options.length ? pick(r, options) : ''
}

function themeLine(r: Rand, t: string, m: string): string {
  const hit = THEMES.find(([re]) => re.test(t))
  const bank = hit ? hit[1] : THEME_FALLBACK
  return fill(pick(r, bank), { m, M: cap(m), t })
}

/** 3 to 4 sentences about a whole look: the pieces, how they work together, the model's energy, the theme. */
export function lookNote(pieces: NotePiece[], model?: string, theme?: string): string {
  const list = (pieces ?? []).filter((p) => p && (p.name || p.category))
  if (!list.length) return ''
  const m = safeModel(model)
  const t = safeTheme(theme)
  const ids = list.map((p) => p.id ?? p.name).slice().sort().join(',')
  const r = seeded(`look|${ids}|${(theme ?? '').toLowerCase().trim()}`)
  const xs = list.slice(0, 8).map(prepare)
  const M = cap(m)

  const hero = heroOf(r, xs)
  // The hero is named first in the intro, so the next sentence follows on naturally.
  const ordered = [hero, ...xs.filter((x) => x !== hero)]
  const intro = t
    ? fill(pick(r, LOOK_INTROS_THEME), { m, M, t, list: listOf(ordered) })
    : fill(pick(r, LOOK_INTROS), { m, M, list: listOf(ordered) })
  const heroLine = fill(pick(r, HERO_LINES), { ...pieceVars(hero, m), fab: fabricLine(r, hero, m) })
  const middle = xs.length === 1 ? fitFeelLine(r, hero, m) || stylingLine(r, hero, m) : comboLine(r, xs, hero, m)
  const closer = t ? themeLine(r, t, m) : fill(pick(r, ATTITUDE), { m, M })

  const out = finish([intro, heroLine, middle, closer])
  if (out.length <= MAX) return out
  // Long names: a shorter intro first, then drop the middle sentence if still needed.
  const n = `${NUMBER[xs.length] ?? xs.length} piece${xs.length === 1 ? '' : 's'}`
  const shortIntro = t ? `For ${t}, ${m} brought ${n} to the runway.` : `${M} hit the runway in ${n}.`
  return fit420([shortIntro, heroLine, middle, closer], [2])
}
