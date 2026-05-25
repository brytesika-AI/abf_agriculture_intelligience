/**
 * abfAgri — AI Photo Diagnosis
 * Cloudflare Pages Function: POST /api/photo-diagnose
 *
 * Response fields:
 *   condition, severity, description, cause, urgency,
 *   product, rate, timing, how_to_apply, roi, conf, demo, source
 */

const VISION_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';

// ── Category-specific rich fallback responses ─────────────────────────────────
const DEMO = {
  crops: {
    condition: 'Fall Armyworm (Spodoptera frugiperda) — Imvubela / Inchworm',
    severity: 'moderate',
    description: 'Your maize plant leaves show small see-through "window" holes where the skin of the leaf has been eaten away. You can also see small dark droppings (called frass) that look like wet sawdust sitting inside the funnel at the top of the plant. This is caused by the Fall Armyworm caterpillar — a fast-moving green or brown worm about the size of your finger. It hides inside the plant during the day and eats all night. About 2 in every 10 plants in your field are already affected.',
    cause: 'A small moth flew into your field at night and laid hundreds of eggs on the leaves. The eggs hatched into these caterpillars. Hot and rainy weather speeds up how fast they grow and spread. One armyworm can eat a full plant in just 3–5 days.',
    urgency: 'Act within 48 hours — these worms move fast and can destroy 60–80% of your crop if left untreated for one week. The longer you wait, the harder and more expensive it becomes to save your field.',
    product: 'Omnia Bravest 300 SC',
    rate: '400 mL per hectare — mix with 200 litres of water (about 40 full 5-litre containers)',
    timing: 'Spray in the late afternoon or at sunset. The worms come out to feed at night so this is when the spray works best. Repeat after 7 days if you still see damage.',
    how_to_apply: '1. Mix 400 mL of Bravest 300 SC into 200 L of water. 2. Shake well before and during spraying. 3. Spray directly into the top funnel (whorl) of each plant — this is where the worms hide. 4. Cover every plant. 5. Wear gloves, old clothes, and a mask. 6. Keep children and animals out of the field for 24 hours.',
    roi: 'Bravest 300 SC costs about R1,800/ha to apply. Fall Armyworm can destroy maize worth R12,000–R18,000/ha at today\'s SAFEX price of R3,388/ton. Every R1 spent protects R7–R10 of crop value.',
    conf: 0.84
  },
  vegetables: {
    condition: 'Powdery Mildew (Erysiphe spp.) — White Leaf Disease',
    severity: 'moderate',
    description: 'Your vegetable leaves have a white or grey powdery coating on the top surface — it looks like someone dusted the leaves with flour or ash. This is a fungus called Powdery Mildew. The leaves underneath are turning yellow and starting to dry out. Older leaves lower on the plant are affected first, and the disease is now moving up to younger leaves. About 35–45% of your plants show signs of this problem.',
    cause: 'This white fungus spreads through tiny invisible seeds called spores that blow through the air. It grows best when days are warm (25–30°C) and nights are cool. It does NOT need rain — it actually grows WORSE in dry, warm conditions. Your current weather is perfect for this fungus to spread quickly.',
    urgency: 'Spray now — this fungus doubles in area every 5–7 days. What is affecting 35% of your crop today will be 70–90% in two weeks. Once the plant is heavily coated, it stops making food properly and your yield drops by 40–60%.',
    product: 'Omnia Funguran OH 50 WP',
    rate: '200 g per 100 litres of water — one big handful (about 200 g) into one full 100-litre drum',
    timing: 'Spray first thing in the morning or in the late afternoon — not in the midday heat. Repeat every 7 days for at least 3 sprays in a row.',
    how_to_apply: '1. Measure 200 g of Funguran OH 50 WP into clean water. 2. Stir until the powder is fully dissolved. 3. Spray on TOP of leaves AND underneath — the fungus lives on both sides. 4. Leaves should look wet but not dripping. 5. Wash your hands and face after spraying.',
    roi: 'One treatment costs about R280–R350/ha. Doing nothing means losing 40–60% of marketable vegetables worth R3,500–R6,200/ha at current prices. Treatment pays for itself many times over.',
    conf: 0.79
  },
  fruits: {
    condition: 'Citrus Bacterial Canker (Xanthomonas citri subsp. citri)',
    severity: 'severe',
    description: 'Your citrus leaves and young fruit have raised rough spots that look like small bumps or blisters. These spots are brown or tan in the middle with a yellow ring on the outside — like a small target or bullseye. On the fruit, the same raised bumpy spots are appearing and making the skin look damaged and rough. About 25–40% of your fruit already shows this damage. Buyers and exporters will reject this fruit because it does not look good — even though it is safe to eat.',
    cause: 'This is a bacterial disease. Tiny bacteria get into the tree through wounds on leaves and fruit caused by wind, insects, or pruning tools. Rain splashing and wind spread the bacteria from plant to plant across your orchard. Once the bacteria are inside a plant they cannot be removed — you can only protect healthy leaves and fruit from infection.',
    urgency: 'SEVERE — act within 24 hours. Every rain event spreads the bacteria further. New leaves and new fruit are most at risk. Once fruit is damaged it cannot be exported and its market value drops 60–80%.',
    product: 'Omnia Copper Oxychloride 850 WP',
    rate: '300 g per 100 litres of water — three handfuls into a full 100-litre drum',
    timing: 'Spray today or tomorrow morning before it rains again. Then spray every new flush of growth (every 3–4 weeks during the growing season). Copper creates a protective coat — it stops healthy leaves from being infected.',
    how_to_apply: '1. Mix 300 g of Copper Oxychloride into 100 L of water — keep stirring as it settles. 2. Spray ALL parts of the tree: top branches, middle, inside canopy, and under leaves. 3. Protect all new growth — new leaves are most vulnerable. 4. Do not spray in wind or rain. 5. Wear rubber gloves and eye protection.',
    roi: 'Copper spray costs about R900/ha. Losing export quality on citrus means losing R30,000–R40,000/ha in premium price. Protecting even half your crop with this spray means R15,000+ saved.',
    conf: 0.78
  },
  livestock: {
    condition: 'Tick Burden + Pasture Mineral Deficiency (Magnesium & Selenium)',
    severity: 'moderate',
    description: 'Your animals look thinner than they should be — their backbone and hip bones are more visible than normal. Their eyes look pale instead of pink, and their energy is low — they move slowly and are not eating or drinking properly. Cows are giving less milk than before. When you look at the grass they are eating, it looks yellowish and pale instead of rich dark green. These are signs of two problems together: heavy tick infestation on the animals AND the grass not having enough magnesium and selenium minerals.',
    cause: 'The ticks are draining blood and energy from your animals and spreading disease through their bites. At the same time, your pasture soil is low in magnesium and selenium — this means the grass cannot give these important minerals to your animals even when they eat enough. Animals under tick stress AND mineral deficiency get sick much faster than with only one problem.',
    urgency: 'Both problems need to be fixed at the same time — fixing one and not the other will not give good results. Without treatment, body condition will keep falling, milk production may drop another 15–25%, and weaker animals may get tick fever which can be fatal.',
    product: 'Omnia Magnesol Foliar (Pasture) + Veterinary Acaricide Dip',
    rate: 'Magnesol: 5 litres per hectare on the pasture grass · Acaricide dip: follow the label for your dip product and animal weight',
    timing: 'Apply Magnesol to the pasture at the next irrigation or when rain is expected. Do the acaricide dip on all animals this week. Repeat the dip every 2–3 weeks during tick season.',
    how_to_apply: '1. For the pasture: mix Magnesol at 5 L/ha in water and apply through irrigation or knapsack sprayer over the grass. 2. For the animals: prepare dip tank with correct acaricide concentration per the label. Dip ALL animals on the same day including calves. 3. Keep animals off treated pasture for 24 hours after spraying Magnesol. 4. Check animals again in 2 weeks for improved body condition and less tick activity.',
    roi: 'Magnesol treatment costs about R850/ha. Losing a cow to tick fever costs R15,000–R25,000. Recovering milk production adds R2,000–R4,000 per cow over the next 3 months. Every rand spent on treatment protects many rands of animal value.',
    conf: 0.74
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function extractJSON(text) {
  // Try to find the largest valid JSON object in the response
  const match = (text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ── Handlers ──────────────────────────────────────────────────────────────────
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = corsHeaders();

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
  }

  const { category = 'crops', image_data } = body;
  const cat = (category || 'crops').toLowerCase();
  const fallback = DEMO[cat] || DEMO.crops;

  // No image or no AI binding → return demo
  if (!image_data || !env.AI) {
    return new Response(JSON.stringify({ ...fallback, demo: true, source: 'no_ai_binding' }), { headers });
  }

  try {
    // Decode base64 JPEG → Uint8Array for LLaVA
    const binary = atob(image_data);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const prompt = `You are an expert agronomist for SADC (Southern Africa) helping smallholder and commercial farmers who may not have a science background. Analyse this ${cat} image carefully.

Return ONLY a valid JSON object — no markdown, no extra text, no code fences. Use plain English that any farmer can understand — avoid scientific jargon. If you must use a technical term, explain it simply in brackets.

{
  "condition": "The disease or pest name in English. If it has a common local name, add it after a dash.",
  "severity": "mild or moderate or severe or critical",
  "description": "In plain English: describe exactly what you see in the photo — the colours, spots, damage, affected parts, how many plants or animals. Write as if explaining to a farmer face-to-face. 3-5 sentences. No jargon.",
  "cause": "Simple 2-3 sentence explanation of what is causing this — fungus, insect, bacteria, weather, soil problem etc. Use everyday language. Explain how it spreads.",
  "urgency": "One or two sentences: why the farmer must act now, and what will happen if they wait. Be specific about time.",
  "product": "Specific recommended Omnia product name",
  "rate": "Application rate written practically — e.g. '400 mL per hectare, mixed into 200 litres of water (about 40 x 5-litre containers)'",
  "timing": "When and how often to apply — morning or evening, how many days between applications, for how long",
  "how_to_apply": "Step by step instructions in simple English — numbered steps, practical, including safety advice",
  "roi": "Cost of treatment vs cost of doing nothing — use ZAR numbers if possible. Keep it simple and clear.",
  "conf": 0.85
}`;

    const aiResult = await env.AI.run(VISION_MODEL, {
      image: [...bytes],
      prompt,
      max_tokens: 900
    });

    const rawText = aiResult.description || aiResult.response || '';
    const parsed  = extractJSON(rawText);

    if (parsed && parsed.condition && parsed.severity) {
      return new Response(JSON.stringify({
        ...parsed,
        demo: false,
        source: 'vision_ai'
      }), { headers });
    }

    // Model responded but JSON couldn't be parsed
    // Use raw text as description, fill rest from fallback
    return new Response(JSON.stringify({
      ...fallback,
      description: rawText.trim().substring(0, 600) || fallback.description,
      demo: false,
      source: 'vision_ai_raw'
    }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({
      ...fallback,
      demo: true,
      source: 'error_fallback',
      _error: err.message
    }), { headers });
  }
}
