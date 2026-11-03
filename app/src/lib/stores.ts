// In-app stores: curated pretend catalogs she can add pieces from into her wishlist.
// Images are product shots rendered on the family MacBook (local model, no people in them),
// stored as transparent webp in app/public/stores/<id>.webp.
import type { Category, Colour, Pattern, Season } from '../types'

export interface StorePiece {
  id: string
  name: string
  category: Category
  colours: Colour[]
  pattern: Pattern
  fabric: string
  fit: string
  feel: string
  warmth: 1 | 2 | 3 | 4 | 5
  formality: 1 | 2 | 3 | 4 | 5
  seasons: Season[]
  /** Season Drop pieces belong to a theme pack (matches theme_packs.name). */
  pack?: string
}
export interface Store { id: string; name: string; tag: string; emoji: string; items: StorePiece[] }

export const STORES: Store[] = [
 {
  "id": "starlight",
  "name": "Starlight Atelier",
  "tag": "Red carpet and gowns",
  "emoji": "✨",
  "items": [
   {
    "id": "blush-tulle-gown",
    "name": "blush tulle gown",
    "category": "dress",
    "colours": [
     "pink"
    ],
    "pattern": "texture",
    "fabric": "tulle and sequins",
    "fit": "fitted bodice, full ballerina skirt",
    "feel": "twirl-ready, first-dance energy",
    "warmth": 2,
    "formality": 5,
    "seasons": [
     "spring",
     "summer"
    ]
   },
   {
    "id": "midnight-velvet-gown",
    "name": "midnight velvet gown",
    "category": "dress",
    "colours": [
     "navy"
    ],
    "pattern": "solid",
    "fabric": "stretch velvet",
    "fit": "long column, cap sleeves",
    "feel": "old Hollywood after dark",
    "warmth": 3,
    "formality": 5,
    "seasons": [
     "fall",
     "winter"
    ]
   },
   {
    "id": "silver-sequin-mini",
    "name": "silver sequin party dress",
    "category": "dress",
    "colours": [
     "grey"
    ],
    "pattern": "texture",
    "fabric": "sequin on mesh",
    "fit": "shift, midi length",
    "feel": "disco ball in dress form",
    "warmth": 2,
    "formality": 4,
    "seasons": [
     "winter"
    ]
   },
   {
    "id": "emerald-satin-gown",
    "name": "emerald satin gown",
    "category": "dress",
    "colours": [
     "green"
    ],
    "pattern": "solid",
    "fabric": "duchess satin",
    "fit": "sweetheart bodice, A-line skirt",
    "feel": "emerald city premiere",
    "warmth": 2,
    "formality": 5,
    "seasons": [
     "fall",
     "winter"
    ]
   },
   {
    "id": "gold-cape-gown",
    "name": "gold cape gown",
    "category": "dress",
    "colours": [
     "yellow"
    ],
    "pattern": "texture",
    "fabric": "metallic chiffon",
    "fit": "floaty with a sheer cape",
    "feel": "golden hour on the steps",
    "warmth": 2,
    "formality": 5,
    "seasons": [
     "spring",
     "summer"
    ]
   },
   {
    "id": "ivory-faux-fur-stole",
    "name": "ivory faux fur stole",
    "category": "scarf",
    "colours": [
     "cream"
    ],
    "pattern": "texture",
    "fabric": "faux fur",
    "fit": "wraps around like a hug",
    "feel": "instant movie star",
    "warmth": 4,
    "formality": 5,
    "seasons": [
     "winter"
    ]
   },
   {
    "id": "crystal-tiara",
    "name": "crystal tiara",
    "category": "hat",
    "colours": [
     "grey"
    ],
    "pattern": "solid",
    "fabric": "silver tone metal and crystals",
    "fit": "sits on the crown",
    "feel": "main character, obviously",
    "warmth": 1,
    "formality": 5,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "satin-opera-gloves",
    "name": "satin opera gloves",
    "category": "accessory",
    "colours": [
     "white"
    ],
    "pattern": "solid",
    "fabric": "stretch satin",
    "fit": "above the elbow",
    "feel": "fancy wave to the crowd",
    "warmth": 2,
    "formality": 5,
    "seasons": [
     "fall",
     "winter"
    ]
   },
   {
    "id": "pearl-clutch",
    "name": "pearl clutch",
    "category": "bag",
    "colours": [
     "cream"
    ],
    "pattern": "texture",
    "fabric": "faux pearls",
    "fit": "small top clasp",
    "feel": "holds a lip gloss and a secret",
    "warmth": 1,
    "formality": 5,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "glitter-heels",
    "name": "glitter block heels",
    "category": "shoes",
    "colours": [
     "pink"
    ],
    "pattern": "texture",
    "fabric": "glitter",
    "fit": "low block heel, buckle strap",
    "feel": "sparkle with every step",
    "warmth": 2,
    "formality": 5,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "red-ruffle-gown",
    "name": "red ruffle gown",
    "category": "dress",
    "colours": [
     "red"
    ],
    "pattern": "solid",
    "fabric": "layered organza",
    "fit": "tiered ruffles to the floor",
    "feel": "showstopper, full stop",
    "warmth": 2,
    "formality": 5,
    "seasons": [
     "winter"
    ]
   },
   {
    "id": "lilac-cape",
    "name": "lilac velvet cape",
    "category": "outerwear",
    "colours": [
     "purple"
    ],
    "pattern": "solid",
    "fabric": "crushed velvet",
    "fit": "hooded, swingy",
    "feel": "arrives before the music does",
    "warmth": 3,
    "formality": 4,
    "seasons": [
     "fall",
     "winter"
    ]
   }
  ]
 },
 {
  "id": "trunk",
  "name": "Once Upon a Trunk",
  "tag": "Costumes and fantasy",
  "emoji": "🧚",
  "items": [
   {
    "id": "fairy-wings",
    "name": "fairy wings",
    "category": "accessory",
    "colours": [
     "multi"
    ],
    "pattern": "print",
    "fabric": "iridescent film on wire",
    "fit": "straps on like a backpack",
    "feel": "light enough to fly",
    "warmth": 1,
    "formality": 2,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "mermaid-skirt",
    "name": "mermaid sequin skirt",
    "category": "bottom",
    "colours": [
     "blue"
    ],
    "pattern": "texture",
    "fabric": "flip sequins",
    "fit": "long with a fishtail hem",
    "feel": "splash zone",
    "warmth": 2,
    "formality": 3,
    "seasons": [
     "summer"
    ]
   },
   {
    "id": "witch-hat",
    "name": "starry witch hat",
    "category": "hat",
    "colours": [
     "purple"
    ],
    "pattern": "print",
    "fabric": "felt",
    "fit": "tall and bent at the tip",
    "feel": "cauldron chic",
    "warmth": 2,
    "formality": 2,
    "seasons": [
     "fall"
    ]
   },
   {
    "id": "hero-cape",
    "name": "superhero cape",
    "category": "outerwear",
    "colours": [
     "red"
    ],
    "pattern": "solid",
    "fabric": "satin",
    "fit": "long, ties in a bow",
    "feel": "saves the day, then the runway",
    "warmth": 1,
    "formality": 2,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "princess-crown",
    "name": "princess crown",
    "category": "hat",
    "colours": [
     "yellow"
    ],
    "pattern": "solid",
    "fabric": "gold tone metal and gems",
    "fit": "tall pointed crown",
    "feel": "royal decree: twirl",
    "warmth": 1,
    "formality": 4,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "dragon-hoodie",
    "name": "dragon hoodie",
    "category": "top",
    "colours": [
     "green"
    ],
    "pattern": "print",
    "fabric": "fleece",
    "fit": "oversized with spikes on the hood",
    "feel": "cosy but fierce",
    "warmth": 4,
    "formality": 1,
    "seasons": [
     "fall",
     "winter"
    ]
   },
   {
    "id": "unicorn-horn-band",
    "name": "unicorn horn headband",
    "category": "hat",
    "colours": [
     "multi"
    ],
    "pattern": "texture",
    "fabric": "satin and glitter",
    "fit": "headband",
    "feel": "pure magic",
    "warmth": 1,
    "formality": 2,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "astronaut-jumpsuit",
    "name": "astronaut jumpsuit",
    "category": "dress",
    "colours": [
     "white"
    ],
    "pattern": "print",
    "fabric": "cotton twill",
    "fit": "zip front, roomy",
    "feel": "one small step for fashion",
    "warmth": 3,
    "formality": 2,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "pirate-coat",
    "name": "pirate captain coat",
    "category": "outerwear",
    "colours": [
     "navy"
    ],
    "pattern": "solid",
    "fabric": "brushed wool blend",
    "fit": "long with gold buttons",
    "feel": "captain of the catwalk",
    "warmth": 4,
    "formality": 3,
    "seasons": [
     "fall",
     "winter"
    ]
   },
   {
    "id": "pumpkin-dress",
    "name": "pumpkin tutu dress",
    "category": "dress",
    "colours": [
     "orange"
    ],
    "pattern": "solid",
    "fabric": "tulle",
    "fit": "puffy tutu, green collar",
    "feel": "pumpkin patch royalty",
    "warmth": 2,
    "formality": 2,
    "seasons": [
     "fall"
    ]
   },
   {
    "id": "snow-queen-cape",
    "name": "snow queen cape",
    "category": "outerwear",
    "colours": [
     "blue"
    ],
    "pattern": "texture",
    "fabric": "sheer organza with glitter",
    "fit": "long and trailing",
    "feel": "let it snow, dramatically",
    "warmth": 2,
    "formality": 4,
    "seasons": [
     "winter"
    ]
   },
   {
    "id": "ruby-slippers",
    "name": "ruby sequin slippers",
    "category": "shoes",
    "colours": [
     "red"
    ],
    "pattern": "texture",
    "fabric": "sequins",
    "fit": "flats with a bow",
    "feel": "click twice, go to the party",
    "warmth": 1,
    "formality": 3,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   }
  ]
 },
 {
  "id": "encore",
  "name": "Encore Street",
  "tag": "Pop star and street",
  "emoji": "🎤",
  "items": [
   {
    "id": "holo-bomber",
    "name": "holographic bomber",
    "category": "outerwear",
    "colours": [
     "multi"
    ],
    "pattern": "texture",
    "fabric": "holographic nylon",
    "fit": "cropped bomber",
    "feel": "headliner arrival",
    "warmth": 3,
    "formality": 2,
    "seasons": [
     "spring",
     "fall"
    ]
   },
   {
    "id": "sequin-blazer",
    "name": "pink sequin blazer",
    "category": "outerwear",
    "colours": [
     "pink"
    ],
    "pattern": "texture",
    "fabric": "sequin",
    "fit": "boxy, sleeves pushed up",
    "feel": "encore, encore",
    "warmth": 2,
    "formality": 4,
    "seasons": [
     "spring",
     "fall",
     "winter"
    ]
   },
   {
    "id": "platform-sneakers",
    "name": "platform sneakers",
    "category": "shoes",
    "colours": [
     "white"
    ],
    "pattern": "solid",
    "fabric": "leather look",
    "fit": "chunky platform sole",
    "feel": "two inches closer to the stars",
    "warmth": 2,
    "formality": 1,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "neon-shades",
    "name": "heart sunglasses",
    "category": "accessory",
    "colours": [
     "pink"
    ],
    "pattern": "solid",
    "fabric": "plastic",
    "fit": "oversized heart frames",
    "feel": "paparazzi proof",
    "warmth": 1,
    "formality": 1,
    "seasons": [
     "spring",
     "summer"
    ]
   },
   {
    "id": "bucket-hat",
    "name": "checker bucket hat",
    "category": "hat",
    "colours": [
     "multi"
    ],
    "pattern": "check",
    "fabric": "cotton canvas",
    "fit": "soft brim",
    "feel": "festival front row",
    "warmth": 2,
    "formality": 1,
    "seasons": [
     "spring",
     "summer"
    ]
   },
   {
    "id": "cargo-pants",
    "name": "glitter cargo pants",
    "category": "bottom",
    "colours": [
     "black"
    ],
    "pattern": "texture",
    "fabric": "nylon with glitter",
    "fit": "baggy, cuffed hems",
    "feel": "dance practice, but famous",
    "warmth": 3,
    "formality": 1,
    "seasons": [
     "spring",
     "fall",
     "winter"
    ]
   },
   {
    "id": "tour-tee",
    "name": "tour tee",
    "category": "top",
    "colours": [
     "black"
    ],
    "pattern": "print",
    "fabric": "cotton jersey",
    "fit": "oversized, knotted at the side",
    "feel": "merch table classic",
    "warmth": 2,
    "formality": 1,
    "seasons": [
     "spring",
     "summer",
     "fall"
    ]
   },
   {
    "id": "star-mic-bag",
    "name": "star crossbody bag",
    "category": "bag",
    "colours": [
     "purple"
    ],
    "pattern": "texture",
    "fabric": "glitter vinyl",
    "fit": "small, long strap",
    "feel": "hands free for the mic",
    "warmth": 1,
    "formality": 2,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "fringe-jacket",
    "name": "silver fringe jacket",
    "category": "outerwear",
    "colours": [
     "grey"
    ],
    "pattern": "texture",
    "fabric": "metallic faux leather",
    "fit": "cropped with long fringe",
    "feel": "the fringe does the dancing",
    "warmth": 3,
    "formality": 3,
    "seasons": [
     "fall",
     "winter"
    ]
   },
   {
    "id": "tutu-skirt",
    "name": "rainbow tutu skirt",
    "category": "bottom",
    "colours": [
     "multi"
    ],
    "pattern": "stripe",
    "fabric": "layered tulle",
    "fit": "short and full",
    "feel": "pop princess",
    "warmth": 1,
    "formality": 2,
    "seasons": [
     "spring",
     "summer"
    ]
   },
   {
    "id": "chain-belt",
    "name": "charm chain belt",
    "category": "accessory",
    "colours": [
     "grey"
    ],
    "pattern": "solid",
    "fabric": "silver tone chain",
    "fit": "low rise, easy fit",
    "feel": "jingles on the beat",
    "warmth": 1,
    "formality": 2,
    "seasons": [
     "spring",
     "summer",
     "fall",
     "winter"
    ]
   },
   {
    "id": "puffer-vest",
    "name": "cloud puffer vest",
    "category": "outerwear",
    "colours": [
     "white"
    ],
    "pattern": "solid",
    "fabric": "quilted nylon",
    "fit": "cropped and puffy",
    "feel": "cool when it is cold",
    "warmth": 4,
    "formality": 1,
    "seasons": [
     "fall",
     "winter"
    ]
   }
  ]
 },
 {
  "id": "seasondrop",
  "name": "Season Drop",
  "tag": "Seasonal and themed",
  "emoji": "🍂",
  "items": [
   {
    "id": "black-cat-ears",
    "name": "black cat ears",
    "category": "hat",
    "colours": [
     "black"
    ],
    "pattern": "solid",
    "fabric": "faux fur",
    "fit": "headband",
    "feel": "black cat energy",
    "warmth": 1,
    "formality": 2,
    "seasons": [
     "fall"
    ],
    "pack": "Halloween"
   },
   {
    "id": "candy-corn-sweater",
    "name": "candy corn sweater",
    "category": "top",
    "colours": [
     "orange"
    ],
    "pattern": "stripe",
    "fabric": "chunky knit",
    "fit": "cropped, puff sleeves",
    "feel": "sweet tooth season",
    "warmth": 4,
    "formality": 1,
    "seasons": [
     "fall"
    ],
    "pack": "Halloween"
   },
   {
    "id": "spider-web-skirt",
    "name": "spider web skirt",
    "category": "bottom",
    "colours": [
     "black"
    ],
    "pattern": "print",
    "fabric": "mesh over tulle",
    "fit": "short and floaty",
    "feel": "spooky but make it cute",
    "warmth": 2,
    "formality": 2,
    "seasons": [
     "fall"
    ],
    "pack": "Halloween"
   },
   {
    "id": "snowflake-sweater",
    "name": "snowflake sweater",
    "category": "top",
    "colours": [
     "white"
    ],
    "pattern": "print",
    "fabric": "soft knit",
    "fit": "relaxed",
    "feel": "cocoa in hand",
    "warmth": 5,
    "formality": 2,
    "seasons": [
     "winter"
    ],
    "pack": "Winter Formal"
   },
   {
    "id": "velvet-bow-dress",
    "name": "velvet bow dress",
    "category": "dress",
    "colours": [
     "red"
    ],
    "pattern": "solid",
    "fabric": "velvet",
    "fit": "fitted top, full skirt, big bow",
    "feel": "holiday party ready",
    "warmth": 3,
    "formality": 4,
    "seasons": [
     "winter"
    ],
    "pack": "Winter Formal"
   },
   {
    "id": "faux-fur-earmuffs",
    "name": "fluffy earmuffs",
    "category": "hat",
    "colours": [
     "white"
    ],
    "pattern": "texture",
    "fabric": "faux fur",
    "fit": "over the ears",
    "feel": "snow day sparkle",
    "warmth": 4,
    "formality": 2,
    "seasons": [
     "winter"
    ],
    "pack": "Winter Formal"
   },
   {
    "id": "daisy-sundress",
    "name": "daisy sundress",
    "category": "dress",
    "colours": [
     "yellow"
    ],
    "pattern": "floral",
    "fabric": "cotton poplin",
    "fit": "tiered, tie straps",
    "feel": "picnic in the sun",
    "warmth": 1,
    "formality": 2,
    "seasons": [
     "spring",
     "summer"
    ],
    "pack": "Spring Break"
   },
   {
    "id": "rain-slicker",
    "name": "rainbow raincoat",
    "category": "outerwear",
    "colours": [
     "multi"
    ],
    "pattern": "stripe",
    "fabric": "glossy PVC",
    "fit": "hooded, roomy",
    "feel": "rainy day rainbow",
    "warmth": 3,
    "formality": 1,
    "seasons": [
     "spring"
    ],
    "pack": "Spring Break"
   },
   {
    "id": "pastel-cardigan",
    "name": "pastel cloud cardigan",
    "category": "top",
    "colours": [
     "purple"
    ],
    "pattern": "texture",
    "fabric": "fuzzy knit",
    "fit": "cropped",
    "feel": "pastel everything",
    "warmth": 3,
    "formality": 2,
    "seasons": [
     "spring"
    ],
    "pack": "Spring Break"
   },
   {
    "id": "lemon-swim-cover",
    "name": "lemon print cover-up",
    "category": "dress",
    "colours": [
     "yellow"
    ],
    "pattern": "print",
    "fabric": "cotton gauze",
    "fit": "loose, button front",
    "feel": "lemonade stand",
    "warmth": 1,
    "formality": 1,
    "seasons": [
     "summer"
    ],
    "pack": "Summer"
   },
   {
    "id": "star-spangle-shorts",
    "name": "star denim shorts",
    "category": "bottom",
    "colours": [
     "denim"
    ],
    "pattern": "print",
    "fabric": "denim",
    "fit": "high rise, rolled hem",
    "feel": "Fourth of July",
    "warmth": 1,
    "formality": 1,
    "seasons": [
     "summer"
    ],
    "pack": "Summer"
   },
   {
    "id": "straw-sun-hat",
    "name": "big straw sun hat",
    "category": "hat",
    "colours": [
     "tan"
    ],
    "pattern": "texture",
    "fabric": "woven straw",
    "fit": "wide brim, ribbon",
    "feel": "sunset at the beach",
    "warmth": 1,
    "formality": 2,
    "seasons": [
     "summer"
    ],
    "pack": "Summer"
   }
  ]
 }
] as Store[]

export const storeImageUrl = (pieceId: string) => `${import.meta.env.BASE_URL}stores/${pieceId}.webp`

/** A wishlist item added from a store keeps the store name as its brand and this note marker. */
export const storeMarker = (storeId: string, pieceId: string) => `store:${storeId}/${pieceId}`
export const storeRefOf = (notes?: string) => notes?.match(/store:([a-z0-9-]+)\/([a-z0-9-]+)/)?.slice(1, 3) as [string, string] | undefined
