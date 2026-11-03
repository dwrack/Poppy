# Wishlist closet, stores, link import, designer fit notes

Branch `v4/wishlist` (off `v4/family`). Asked for by David 2026-11-02: "a closet of clothes she owns, then she can pick
through friends' closets, and then some stores she can look through, or links to actual clothes to import into her
wish list closet". Each look gets a fashion designer talking about the fit, "the clothes and the model they are on".
She adds and removes what she wants. Stores: red carpet and gowns, costumes and fantasy, pop star and street, seasonal.

## Decisions (fixed, build to these)

1. **One new field.** `Item.closet?: 'mine' | 'wish'` (missing = mine). Helpers `closetOf`, `isWish` in `types.ts`.
   No Dexie version bump: filter in JS (`closetOf(i)`). Cloud column `items.closet text not null default 'mine'
   check (closet in ('mine','wish'))` in `supabase/v10-wishlist.sql`.
2. **Sync.** `toRow` sends `closet` ONLY when it is `'wish'` (so normal pushes keep working before v10 is pasted; a wish
   push before v10 just fails per item and retries later, which doPush already tolerates). `pullAll` maps
   `closet: row.closet === 'wish' ? 'wish' : undefined`. Add `closet` to the `Row` type.
3. **Closet tab.** Segmented switch in the Closet header: `👚 My closet` | `✨ Wishlist` (with counts). My closet shows
   only mine; Wishlist only wish. Dress me button stays. FAB `+`: in My closet opens AddItem as today; in Wishlist opens
   a small sheet: `🛍️ Browse stores`, `🔗 Paste a link`, `📸 Snap or screenshot` (AddItem with closet 'wish').
4. **Stores** (`lib/stores.ts`, already written: `STORES`, `storeImageUrl`, `storeMarker`, `storeRefOf`). New full-screen
   `components/StoreBrowser.tsx`: store picker chips (emoji + name + tag), grid of pieces (image on `.checker`), each with
   an add/remove toggle (`♡ Add` / `✓ On my wishlist`). Season Drop groups by `pack`, the active pack first
   (`useActivePack()` in `lib/game.ts`; if it fails or is Everyday, order Winter Formal, Spring Break, Summer, Halloween
   by next to arrive). Tapping a piece shows a sheet with its designer note and the add toggle.
   - Add = fetch `storeImageUrl(id)` -> Blob, `saveItem({ ...fields, closet: 'wish', brand: store.name,
     notes: storeMarker(store.id, piece.id), photo: blob, cutout: blob, status: 'active', favourite: false,
     tucked: false, links: [], id: crypto.randomUUID(), createdAt/updatedAt now, synced: 0 })`.
   - If that store piece is already in her items (match `storeRefOf(item.notes)`), un-archive it instead
     (`patchItem(id, { status: 'active' })`). Remove = `patchItem(id, { status: 'archived' })` (soft, so past runway
     looks that used it keep rendering). Never a second write path: always `saveItem`/`patchItem` from `lib/sync.ts`.
   - "On my wishlist" = an item with that marker, closet wish, status not archived.
5. **Link import.** `🔗 Paste a link` -> input -> `importLink(url)` in `lib/ai.ts` calls describe-item `{mode:'import', url}`
   which returns `{ title, store, price, url, image: {media_type, data(base64)} , description?: Description }`.
   Client turns the image into a Blob and opens AddItem with `closet='wish'`, the photo pre-loaded (cutout runs as
   usual), fields prefilled from `description`, name from title, brand from store, and `links: [{title, store, url,
   price, exact: true, pasted: true}]` (`pasted` marks her own link: "Search again" keeps it and replaces Claude's old finds). If the function answers "Unknown mode" (not redeployed yet) or fails: show "Couldn't read that
   link. Take a screenshot of the piece and add it with 📸 instead." with a button that opens AddItem in wish mode.
6. **Wish piece sheet** (`ItemSheet`): hide 🧺 wash / 📦 put away for wish pieces. Show `🎉 I got it! Move to my closet`
   (`patchItem(id,{closet:'mine'})`) and `🗑️ Remove from wishlist` (archive, see 4). Shop links show as today (and a
   pasted link shows as a "🔗 <store> · <price>" link). Owned pieces unchanged.
7. **Designer fit notes** (`lib/designer.ts`, pure, no network, deterministic per seed):
   - `pieceNote(piece: NotePiece, model?: string): string` and
     `lookNote(pieces: NotePiece[], model?: string, theme?: string): string`, where
     `NotePiece = { id: string; name: string; category: Category; colours?: Colour[]; pattern?: Pattern; fabric?: string;
     fit?: string; feel?: string; formality?: number }`.
   - Voice: a warm, dramatic fashion designer talking backstage about the clothes and how they look on the model
     ("On Poppy the tulle catches the light every time she turns..."). 2 to 3 sentences for a piece, 3 to 4 for a look.
     Uses the actual fields: fabric, fit, colours, pattern, category, feel, theme.
   - HARD SAFETY RULE: the models are kids (9 to 12). Never mention or imply body, weight, size, shape, figure, curves,
     legs, waist, hips, skin, height, age, "flattering", "slimming", "sexy", "grown up", makeup. Talk only about the
     garment (cut, fabric, colour, movement, construction, styling, how pieces work together) and the model's attitude,
     confidence, walk, pose, energy and choices. Positive and encouraging, never critical of the model. No em dashes.
   - Shown: ItemSheet (`✂️ Designer's notes` box, sage style) for every piece, mine and wish; StoreBrowser piece sheet;
     Dress me under the stage once something is worn (look note with her name); Runway reveal (`Show`) and podium, look
     note from the entry's card pieces (name/category/colours/pattern available) with the entrant's display name and
     the round theme.
   - Her name: use whatever display name the app already has for the signed-in user (find it in `lib/auth.tsx` /
     profile / squads); fall back to no name ("our model").
8. **Dress me**: wish pieces ARE offered (try before you buy), with a small `✨` badge. The Photo button only sends her
   own (`mine`) pieces; wish pieces are skipped like borrowed ones. If every worn piece is a wish piece, Photo is
   disabled with "Photos use clothes you own".
9. **Runway**: wish pieces may be entered (it is a dress-up game), badged `✨ wishlist` in the dressing room picker and
   on reveal cards (`round_entry_cards_v2` gains `'closet', i.closet` in its piece JSON; client `Piece.closet?`).
   Photo jobs never include wish pieces (client `photoItemIds`/`queueEntryPhoto`/`closetPieces` filter, server trigger
   `photo_jobs_before_insert` and `entry_photo_job` both add `closet = 'mine'`). "Wore it for real" unchanged.
10. **Friends never see a wishlist** (v1). Server: `friend_items` adds `and closet = 'mine'`; `item_owned_by` adds
    `and closet = 'mine' and status <> 'archived'`; `items_owned_by` adds `and i.closet = 'mine'`. Client fallback
    filter `closetOf(i) === 'mine'` in `loadFriendCloset` and `loadFriendRack`. A piece with an open borrow request
    (requested/approved/out) cannot be moved to wish (trigger raises), not needed the other way. Files too: v10 replaces
    v9's "group mates see closet files" storage policy so a wish piece's photo and cutout are hers only, except the
    cutout of a wish piece she walked in, for her squad once that round is revealed (`runway_wish_cutout`).
11. **Offline**: add `webp` to the PWA precache glob in `app/vite.config.ts` (48 small files).
12. **v10 paste order**: last, after v9. `local-chain.sh` FILES gains `v10-wishlist`. `smoke.sql` asserts: b cannot see
    a's wish piece via friend_items, cannot borrow it, cannot style with it; a can enter a wish piece in a round; a photo
    job with a wish piece is refused; entry_photo_job ignores wish pieces; closet check constraint rejects 'other';
    moving a lent piece to wish is refused.

Copy and tone: short, friendly, emoji first on buttons, matches existing Tailwind conventions (cream/poppy/sage/ink,
`rounded-2xl`, `ring-1 ring-black/10`, extrabold headings). No em dashes anywhere in copy.
