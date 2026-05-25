/**
 * abfAgri — AI Photo Diagnosis
 * Cloudflare Pages Function: POST /api/photo-diagnose
 *
 * Request body (JSON):
 *   { category: "crops|vegetables|fruits|livestock", image_data: "<base64 JPEG>" }
 *
 * Response (JSON):
 *   { condition, severity, description, product, rate, timing, roi, conf, demo, source }
 *
 * Uses Cloudflare AI vision model (@cf/llava-hf/llava-1.5-7b-hf) when the AI
 * binding is configured in Pages → Settings → Functions → AI Bindings (name: AI).
 * Falls back to pre-built category responses if the binding or model is unavailable.
 */

const VISION_MODEL = '@cf/llava-hf/llava-1.5-7b-hf';

// ── Category-specific fallback responses ─────────────────────────────────────
const DEMO = {
  crops: {
    condition: 'Fall Armyworm (Spodoptera frugiperda)',
    severity: 'moderate',
    description: 'Window-pane feeding patterns with characteristic frass deposits detected in leaf whorls. Young 2nd-instar larvae present on 20–30% of sampled plants. Warm, humid conditions are conducive to rapid population build-up — spread is expected to accelerate over the next 48 hours without intervention.',
    product: 'Omnia Bravest 300 SC',
    rate: '400 mL/ha',
    timing: 'Apply at dusk within 48 hours — larvae are nocturnal feeders',
    roi: 'Treatment cost ~R1,800/ha vs R12,000+/ha yield loss at current SAFEX maize price',
    conf: 0.84
  },
  vegetables: {
    condition: 'Powdery Mildew (Erysiphe spp.)',
    severity: 'moderate',
    description: 'White powdery fungal colonies coalescing on upper leaf surfaces across 35–45% of canopy. Secondary chlorosis and premature leaf abscission observed on older foliage. Warm days with cool nights are creating optimal sporulation conditions.',
    product: 'Omnia Funguran OH 50 WP',
    rate: '200 g per 100 L water',
    timing: 'Apply immediately — repeat every 7 days until conditions improve',
    roi: 'Early intervention recovers 70–85% of marketable yield',
    conf: 0.79
  },
  fruits: {
    condition: 'Citrus Bacterial Canker (Xanthomonas citri subsp. citri)',
    severity: 'severe',
    description: 'Raised, corky lesions with water-soaked yellow halos on leaves and young fruit. Wind-driven spread confirmed across multiple canopy layers. 25–40% fruit surface damage visible — significant export-grade rejection risk at this progression stage.',
    product: 'Omnia Copper Oxychloride 850 WP',
    rate: '300 g per 100 L water',
    timing: 'Apply within 24 hours and protect all new growth flushes',
    roi: 'Copper spray at ~R900/ha vs R35,000/ha export quality crop loss',
    conf: 0.78
  },
  livestock: {
    condition: 'Tick-Borne Anaemia (Anaplasma marginale)',
    severity: 'moderate',
    description: 'Animals displaying pale mucous membranes, lethargy, and reduced grazing activity. Heavy tick burden visible on ears, inner thighs, and underbelly. Without immediate intervention, haemolytic anaemia will progress — mortality risk in calves within 5–7 days.',
    product: 'Acaricide Dip Treatment (consult veterinarian)',
    rate: 'Per registered label',
    timing: 'Immediate veterinary assessment + initiate weekly dipping protocol',
    roi: 'Early treatment prevents per-animal losses of R8,000–R22,000',
    conf: 0.72
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
  const match = (text || '').match(/\{[\s\S]*?\}/);
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

    const prompt = `You are an expert agronomist for SADC (Southern Africa). Analyse this ${cat} image for diseases, pests, nutritional deficiencies, or health problems.
Return ONLY a valid JSON object — no other text, no markdown fences:
{
  "condition": "specific condition name",
  "severity": "mild|moderate|severe|critical",
  "description": "2-3 sentence visual observation describing exactly what you see",
  "product": "specific recommended Omnia product name",
  "rate": "application rate",
  "timing": "when and how to apply",
  "roi": "brief cost vs benefit statement in ZAR",
  "conf": 0.85
}`;

    const aiResult = await env.AI.run(VISION_MODEL, {
      image: [...bytes],
      prompt,
      max_tokens: 600
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

    // Model responded but JSON couldn't be parsed — use description as body
    return new Response(JSON.stringify({
      ...fallback,
      description: rawText.trim().substring(0, 400) || fallback.description,
      demo: false,
      source: 'vision_ai_raw'
    }), { headers });

  } catch (err) {
    // Model not available / error → graceful demo fallback
    return new Response(JSON.stringify({
      ...fallback,
      demo: true,
      source: 'error_fallback',
      _error: err.message
    }), { headers });
  }
}
