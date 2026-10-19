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
  required: ["name", "category", "colours", "pattern", "fabric", "fit", "warmth", "formality", "seasons", "feel", "search_query"],
  properties: {
    name: { type: "string", description: "Short friendly name, 2 to 4 words, e.g. 'mustard ribbed knit'" },
    category: { type: "string", enum: CATEGORIES },
    colours: { type: "array", items: { type: "string", enum: COLOURS }, maxItems: 3 },
    pattern: { type: "string", enum: PATTERNS },
    fabric: { type: "string", description: "Best guess at the fabric, e.g. 'cotton jersey', 'denim', 'satin'" },
    fit: { type: "string", description: "Cut and fit, e.g. 'cropped boxy', 'high-rise straight', 'oversized'" },
    warmth: { type: "integer", minimum: 1, maximum: 5, description: "1 = hot day, 5 = deep winter" },
    formality: { type: "integer", minimum: 1, maximum: 5, description: "1 = lounging, 5 = black tie" },
    seasons: { type: "array", items: { type: "string", enum: SEASONS } },
    feel: { type: "string", description: "One short line on the vibe, e.g. 'soft, slouchy, weekend coffee run'" },
    search_query: { type: "string", description: "A shopping search query that would find this exact piece or close matches" },
  },
};

const findSchema = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      maxItems: 5,
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

    if (body.mode === "describe") {
      if (!image) return json({ error: "No image" }, 400);
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        output_config: { effort: "low", format: { type: "json_schema", schema: describeSchema } },
        system: "You tag clothes for a teen's personal wardrobe app. Be concrete and friendly. The photo is one item laid flat with the background removed.",
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } },
            { type: "text", text: "Describe this piece of clothing." },
          ],
        }],
      });
      if (res.stop_reason === "refusal") return json({ error: "Couldn't describe that photo" }, 422);
      const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
      return json(JSON.parse(text));
    }

    if (body.mode === "find") {
      const query = String(body.query ?? "").slice(0, 200);
      if (!query) return json({ error: "No query" }, 400);
      const content: Anthropic.ContentBlockParam[] = [];
      if (image) content.push({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } });
      content.push({ type: "text", text: `Find where to buy this piece of clothing, or the closest matches, in US stores. Search query to start from: "${query}". Return up to 5 real product pages with prices. Prefer exact matches, then close dupes at lower prices.` });
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "medium", format: { type: "json_schema", schema: findSchema } },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "US" } }],
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
