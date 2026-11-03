// Poppyseed Clothes: describe a clothing photo and find it online.
// Runs as a Supabase Edge Function so the Anthropic key never reaches phones.
import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5-5";
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "bag", "hat", "scarf", "accessory"];
const COLOURS = ["black", "white", "grey", "navy", "blue", "denim", "green", "olive", "brown", "tan", "cream", "red", "pink", "orange", "yellow", "purple", "multi"];
const PATTERNS = ["solid", "stripe", "check", "floral", "print", "texture"];
const SEASONS = ["spring", "summer", "fall", "winter"];

const describeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "category", "colours", "pattern", "fabric", "fit", "warmth", "formality", "seasons", "feel", "search_query", "brand", "size"],
  properties: {
    name: { type: "string", description: "Short friendly name, 2 to 4 words, e.g. 'mustard ribbed knit'" },
    category: { type: "string", enum: CATEGORIES },
    colours: { type: "array", items: { type: "string", enum: COLOURS } },
    pattern: { type: "string", enum: PATTERNS },
    fabric: { type: "string", description: "Best guess at the fabric, e.g. 'cotton jersey', 'denim', 'satin'" },
    fit: { type: "string", description: "Cut and fit, e.g. 'cropped boxy', 'high-rise straight', 'oversized'" },
    warmth: { type: "integer", description: "1 = hot day, 5 = deep winter" },
    formality: { type: "integer", description: "1 = lounging, 5 = black tie" },
    seasons: { type: "array", items: { type: "string", enum: SEASONS } },
    feel: { type: "string", description: "One short line on the vibe, e.g. 'soft, slouchy, weekend coffee run'" },
    search_query: { type: "string", description: "A shopping search query that would find this exact piece or close matches. Include the brand if known." },
    brand: { type: "string", description: "Brand name read from the tag, or empty string if unknown" },
    size: { type: "string", description: "Size read from the tag exactly as printed, e.g. 'XS', '14', '26x30', or empty string if unknown" },
  },
};

const findSchema = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "store", "url", "price", "exact"],
        properties: {
          title: { type: "string" },
          store: { type: "string" },
          url: { type: "string" },
          price: { type: "string", description: "Price with currency as shown, or empty if unknown" },
          exact: { type: "boolean", description: "true if this looks like the same product, false for a close match" },
        },
      },
    },
  },
};

type ImageIn = { media_type: string; data: string };

const DESCRIBE_SYSTEM = "You tag clothes for a teen's personal wardrobe app. Be concrete and friendly. The first photo is one item laid flat with the background removed. If a second photo of the care or brand tag is included, read the brand, size and fabric content from it and prefer those over guesses.";

/** Runs the describe prompt on one photo (and an optional tag photo). Returns null if Claude refuses. */
async function describePiece(image: ImageIn, tag?: ImageIn, hint?: string): Promise<Record<string, unknown> | null> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: { type: "json_schema", schema: describeSchema } },
    system: DESCRIBE_SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: image.media_type as "image/jpeg", data: image.data } },
        ...(tag ? [{ type: "image" as const, source: { type: "base64" as const, media_type: tag.media_type as "image/jpeg", data: tag.data } }, { type: "text" as const, text: "The second photo is the tag." }] : []),
        ...(hint ? [{ type: "text" as const, text: hint }] : []),
        { type: "text", text: "Describe this piece of clothing." },
      ],
    }],
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}

// ---------- Link import (mode 'import') ----------
// The server fetches a shop page the kid pasted, so every hop is checked so it can't be pointed at
// private or internal addresses (SSRF). Errors carry a friendly message and a 4xx status.

class ImportError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** Anthropic takes base64 images up to 5 MB, so bigger raw files skip the describe step. */
const MAX_DESCRIBE_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4) - 1024;
const MAX_REDIRECTS = 3;
const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function ipv4Parts(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

function isPrivateV4([a, b, c]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

/** Expands an IPv6 address to 8 numbers, or null if it is not one. */
function ipv6Words(addr: string): number[] | null {
  let s = addr.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!s.includes(":")) return null;
  const v4 = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) {
    const p = ipv4Parts(v4[1]);
    if (!p) return null;
    s = s.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const words = [...head, ...Array(fill).fill("0"), ...tail].map((w) => parseInt(w, 16));
  return words.length === 8 && words.every((w) => Number.isInteger(w) && w >= 0 && w <= 0xffff) ? words : null;
}

function isPrivateV6(w: number[]): boolean {
  const zeroUpTo = (n: number) => w.slice(0, n).every((x) => x === 0);
  if (zeroUpTo(8)) return true; // ::
  if (zeroUpTo(7) && w[7] === 1) return true; // ::1
  const embedded = [w[6] >> 8, w[6] & 0xff, w[7] >> 8, w[7] & 0xff];
  if (zeroUpTo(5) && (w[5] === 0xffff || w[5] === 0)) return isPrivateV4(embedded); // ::ffff:a.b.c.d and ::a.b.c.d
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) return isPrivateV4(embedded); // NAT64
  if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local (includes fd00:ec2::254 metadata)
  if ((w[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((w[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 old site local
  if ((w[0] & 0xff00) === 0xff00) return true; // multicast
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true; // documentation
  if (w[0] === 0x2002) return isPrivateV4([w[1] >> 8, w[1] & 0xff, w[2] >> 8, w[2] & 0xff]); // 6to4
  return false;
}

function isPrivateAddress(addr: string): boolean {
  const v4 = ipv4Parts(addr);
  if (v4) return isPrivateV4(v4);
  const v6 = ipv6Words(addr);
  return v6 ? isPrivateV6(v6) : true; // anything unparseable is refused
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".arpa"];

/** Throws ImportError unless the URL is https on the normal port and points at a public address. */
async function assertPublicUrl(raw: string | URL): Promise<URL> {
  let u: URL;
  try { u = new URL(String(raw)); } catch { throw new ImportError("That doesn't look like a link", 400); }
  if (u.protocol !== "https:") throw new ImportError("Links need to start with https://", 400);
  if (String(raw).length > 2000) throw new ImportError("That link is too long", 400);
  if (u.username || u.password) throw new ImportError("We can't open that kind of link", 400);
  if (u.port && u.port !== "443") throw new ImportError("We can't open that kind of link", 400);
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes(".") && !host.startsWith("[")) {
    throw new ImportError("We can't open that kind of link", 400);
  }
  const literal = ipv4Parts(host) ? host : host.startsWith("[") ? host.slice(1, -1) : null;
  if (literal) {
    if (isPrivateAddress(literal)) throw new ImportError("We can't open that kind of link", 400);
    return u;
  }
  // Resolve the name and refuse if any answer is private. Fails closed: if the lookup itself is
  // missing, blocked or errors (anything but "no such record"), the link is refused, because the name
  // checks above can't see a public name that points at a private address (127.0.0.1.nip.io).
  // Known gap: fetch() resolves the name again, so a short-TTL rebinding name could still answer
  // differently the second time; closing that needs an egress proxy that blocks private ranges.
  const addrs: string[] = [];
  let resolved = false;
  let failed = typeof Deno.resolveDns !== "function";
  for (const type of ["A", "AAAA"] as const) {
    if (failed) break;
    try {
      addrs.push(...await Deno.resolveDns(host, type));
      resolved = true;
    } catch (e) {
      if ((e as Error).name === "NotFound") resolved = true;
      else failed = true;
    }
  }
  if (failed) throw new ImportError("We can't open that link right now", 400);
  if (resolved && addrs.length === 0) throw new ImportError("Couldn't find that website", 400);
  if (addrs.some(isPrivateAddress)) throw new ImportError("We can't open that kind of link", 400);
  return u;
}

/** Fetches a public https URL, following up to 3 redirects by hand (each re-checked), with a time and size cap. */
async function safeFetch(raw: string, accept: string, maxBytes: number): Promise<{ bytes: Uint8Array; type: string; url: URL }> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let url = await assertPublicUrl(raw);
  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": BROWSER_UA, Accept: accept, "Accept-Language": "en-US,en;q=0.9" },
      });
    } catch (e) {
      throw new ImportError((e as Error).name === "TimeoutError" ? "That page took too long to open" : "Couldn't open that page");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      if (hop >= MAX_REDIRECTS) throw new ImportError("That link bounces around too much");
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url));
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new ImportError("Couldn't open that page");
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) {
      await res.body?.cancel();
      throw new ImportError("That file is too big");
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel();
            throw new ImportError("That file is too big");
          }
          chunks.push(value);
        }
      } catch (e) {
        if (e instanceof ImportError) throw e;
        throw new ImportError((e as Error).name === "TimeoutError" ? "That page took too long to open" : "Couldn't open that page");
      }
    }
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
    return { bytes, type: (res.headers.get("content-type") ?? "").toLowerCase(), url };
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

type PageInfo = { title: string; store: string; amount: string; currency: string; image: string };

const firstString = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? firstString(v[0]) : "";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return firstString(o.url ?? o.contentUrl ?? o.name ?? "");
  }
  return "";
};

/** Finds the first schema.org Product in a JSON-LD blob (handles arrays and @graph). */
function findProduct(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const p = findProduct(n, depth + 1); if (p) return p; }
    return null;
  }
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  const types = (Array.isArray(t) ? t : [t]).map((x) => String(x ?? "").toLowerCase());
  if (types.some((x) => x === "product" || x.endsWith("/product") || x === "productgroup")) return o;
  for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) {
    const p = findProduct(o[key], depth + 1);
    if (p) return p;
  }
  return null;
}

function parsePage(html: string): PageInfo {
  const info: PageInfo = { title: "", store: "", amount: "", currency: "", image: "" };
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content.trim();
  }
  info.title = meta["og:title"] ?? meta["twitter:title"] ?? "";
  info.image = meta["og:image:secure_url"] ?? meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"] ?? "";
  info.store = meta["og:site_name"] ?? "";
  info.amount = meta["product:price:amount"] ?? meta["og:price:amount"] ?? "";
  info.currency = meta["product:price:currency"] ?? meta["og:price:currency"] ?? "";

  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const p = findProduct(data);
    if (!p) continue;
    const variant = Array.isArray(p.hasVariant) ? (p.hasVariant[0] as Record<string, unknown>) : undefined;
    if (!info.title) info.title = firstString(p.name);
    if (!info.image) info.image = firstString(p.image) || firstString(variant?.image);
    if (!info.store) info.store = firstString(p.brand);
    const offers = p.offers ?? variant?.offers;
    const offer = (Array.isArray(offers) ? offers[0] : offers) as Record<string, unknown> | undefined;
    if (offer && !info.amount) {
      info.amount = firstString(offer.price ?? offer.lowPrice ??
        (offer.priceSpecification as Record<string, unknown> | undefined)?.price);
      info.currency = info.currency || firstString(offer.priceCurrency ??
        (offer.priceSpecification as Record<string, unknown> | undefined)?.priceCurrency);
    }
    break;
  }
  if (!info.title) {
    const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (t) info.title = decodeEntities(t[1]).replace(/\s+/g, " ").trim();
  }
  return info;
}

function formatPrice(amount: string, currency: string): string {
  const a = amount.replace(/[^\d.,]/g, "");
  if (!a) return "";
  const n = Number(a.replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  const shown = Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : a;
  const cur = currency.trim().toUpperCase();
  const symbols: Record<string, string> = { USD: "$", CAD: "CA$", AUD: "A$", GBP: "£", EUR: "€" };
  if (!cur || symbols[cur]) return `${symbols[cur || "USD"]}${shown}`;
  return `${shown} ${cur}`;
}

function storeFromHost(u: URL): string {
  const parts = u.hostname.replace(/^www\d?\.|^shop\.|^m\./, "").split(".");
  const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const importSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "store", "price", "image_url"],
  properties: {
    title: { type: "string", description: "Product name as shown on the page" },
    store: { type: "string", description: "Store or website name" },
    price: { type: "string", description: "Current price with currency, e.g. '$28', or empty if not shown" },
    image_url: { type: "string", description: "Absolute https URL of the main product photo, or empty if none" },
  },
};

/** Last resort when the page has no product photo in its tags: let Claude open it (2 fetches max). */
async function readPageWithClaude(u: URL): Promise<{ title: string; store: string; price: string; image_url: string } | null> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    output_config: { effort: "low", format: { type: "json_schema", schema: importSchema } },
    tools: [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 2, allowed_domains: [u.hostname] }],
    messages: [{
      role: "user",
      content: `Open this shop page and read the clothing product on it: ${u.href}\nReturn its name, the store name, the current price and the absolute URL of the main product photo. Leave a field empty if it is not on the page. Do not guess URLs.`,
    }],
  });
  if (res.stop_reason === "refusal") return null;
  const texts = res.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text);
  const last = texts.reverse().find((t) => t.trim().startsWith("{"));
  if (!last) return null;
  try { return JSON.parse(last); } catch { return null; }
}

/** Checks magic bytes so we only pass real jpeg/png/gif/webp along (never svg or html). */
function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function importLink(rawUrl: unknown) {
  const raw = String(rawUrl ?? "").trim();
  if (!raw) throw new ImportError("Paste a link first", 400);
  if (raw.length > 2000) throw new ImportError("That link is too long", 400);
  const pageUrl = await assertPublicUrl(raw);

  let info: PageInfo = { title: "", store: "", amount: "", currency: "", image: "" };
  let finalUrl = pageUrl;
  try {
    const page = await safeFetch(pageUrl.href, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", MAX_HTML_BYTES);
    finalUrl = page.url;
    if (page.type.includes("html") || page.type === "") info = parsePage(new TextDecoder().decode(page.bytes));
  } catch (e) {
    // A refused address stops here. A shop that blocks us or times out still gets the Claude fallback.
    if (!(e instanceof ImportError) || e.status === 400) throw e;
  }
  let price = formatPrice(info.amount, info.currency);
  let imageUrl = info.image;

  if (!imageUrl) {
    const read = await readPageWithClaude(finalUrl).catch((e) => { console.error("import fallback", e); return null; });
    if (read) {
      info.title ||= read.title;
      info.store ||= read.store;
      price ||= read.price;
      imageUrl = read.image_url;
    }
  }
  if (!imageUrl) throw new ImportError("Couldn't find a picture of the piece on that page");

  let imgAbs: URL;
  try { imgAbs = new URL(decodeEntities(imageUrl), finalUrl); } catch { throw new ImportError("Couldn't find a picture of the piece on that page"); }
  if (imgAbs.protocol === "http:") imgAbs.protocol = "https:";
  const img = await safeFetch(imgAbs.href, "image/webp,image/jpeg,image/png,image/*;q=0.8", MAX_IMAGE_BYTES);
  const mediaType = sniffImage(img.bytes);
  if (!img.type.startsWith("image/") || !mediaType) throw new ImportError("That picture didn't work. Try a screenshot instead");
  const image = { media_type: mediaType, data: toBase64(img.bytes) };

  const title = info.title.slice(0, 200);
  let description: Record<string, unknown> | undefined;
  if (img.bytes.byteLength <= MAX_DESCRIBE_BYTES) {
    const hint = `This is a store product photo${title ? ` for "${title.replace(/"/g, "'")}"` : ""}. It may be worn by a model or shown with other pieces. Describe only the main clothing piece.`;
    description = await describePiece(image, undefined, hint)
      .then((d) => d ?? undefined)
      .catch((e) => { console.error("import describe", e); return undefined; });
  }

  return {
    title,
    store: (info.store || storeFromHost(finalUrl)).slice(0, 80),
    price: price.slice(0, 40),
    url: pageUrl.href,
    image,
    ...(description ? { description } : {}),
  };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Only signed-in app users may call this.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Sign in first" }, 401);

    const body = await req.json();
    const image = body.image as { media_type: string; data: string } | undefined;
    const tag = body.tag as { media_type: string; data: string } | undefined;

    if (body.mode === "describe") {
      if (!image) return json({ error: "No image" }, 400);
      const d = await describePiece(image, tag);
      if (!d) return json({ error: "Couldn't describe that photo" }, 422);
      return json(d);
    }

    if (body.mode === "import") {
      try {
        return json(await importLink(body.url));
      } catch (e) {
        if (e instanceof ImportError) {
          console.warn("import refused:", e.message);
          return json({ error: e.message }, e.status);
        }
        throw e;
      }
    }

    if (body.mode === "find") {
      const query = String(body.query ?? "").slice(0, 200);
      if (!query) return json({ error: "No query" }, 400);
      const content: Anthropic.ContentBlockParam[] = [];
      if (image) content.push({ type: "image", source: { type: "base64", media_type: image.media_type as "image/jpeg", data: image.data } });
      content.push({ type: "text", text: `Find where to buy this piece of clothing, or the closest matches, in US stores. Search query to start from: "${query}". Return up to 5 real product pages. Open each product page and read the current price; always fill in price (e.g. "$28"). Prefer exact matches, then close dupes at lower prices.` });
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "medium", format: { type: "json_schema", schema: findSchema } },
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "US" } },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
        ],
        messages: [{ role: "user", content }],
      });
      if (res.stop_reason === "refusal") return json({ matches: [] });
      const texts = res.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text);
      const last = texts.reverse().find((t) => t.trim().startsWith("{")) ?? '{"matches":[]}';
      return json(JSON.parse(last));
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
