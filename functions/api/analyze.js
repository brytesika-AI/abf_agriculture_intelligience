/**
 * abfAgri — 4-Agent Consequence Model Pipeline
 * Cloudflare Pages Function: POST /api/analyze
 *
 * Agent pipeline:
 *   1. Crop Diagnosis Agent     → condition, severity, confidence
 *   2. Consequence Model Agent  → yield loss, ZAR revenue at risk, intervention window
 *   3. Product Recommendation   → top 3 SKUs with ROI (if catalogue provided)
 *
 * AI binding "AI" must be configured in Cloudflare Pages dashboard.
 * Local dev: npx wrangler pages dev . --ai-binding=AI
 */

// ── SYSTEM PROMPTS ─────────────────────────────────────────────────────────────

const SYS_DIAGNOSIS = `You are abfAgri's crop diagnosis specialist for SADC agricultural fields.
Analyse the field data and return ONLY a valid JSON object — no markdown, no explanation:
{
  "condition": "string (e.g. Nitrogen deficiency, Fall armyworm infestation)",
  "condition_code": "NUTRIENT_N_DEF|NUTRIENT_P_DEF|NUTRIENT_K_DEF|PEST_FAW|DISEASE_GREY_LEAF_SPOT|WATER_STRESS|HEAT_STRESS|OTHER",
  "confidence": 0.0,
  "severity": "mild|moderate|severe|critical",
  "causal_chain": ["cause → effect → symptom"],
  "affected_area_pct": 0,
  "urgency_hours": 72,
  "satellite_corroboration": {
    "ndvi_value": 0.0,
    "ndvi_anomaly_pct": 0.0,
    "soil_moisture_anomaly_pct": 0.0
  },
  "secondary_conditions": [{"condition": "string", "confidence": 0.0}]
}
Be specific about severity. Do not hallucinate conditions not supported by the data.`;

const SYS_CONSEQUENCE = `You are abfAgri's consequence modelling engine for SADC agriculture.
Propagate the diagnosis through the causal chain to quantify yield and financial impact.
Use SARB exchange rate: 1 USD = 18.50 ZAR.
Return ONLY valid JSON — no markdown, no explanation:
{
  "consequence_chain": ["diagnosis → physiology → yield reduction → revenue loss"],
  "yield_loss_pct": 0.0,
  "yield_at_risk_ton": 0.0,
  "revenue_at_risk_zar": 0.0,
  "revenue_at_risk_usd": 0.0,
  "time_to_critical_days": 7,
  "recovery_if_treated_now_pct": 0.0,
  "intervention_window": "critical_48h|urgent_7d|recommended_14d|monitor",
  "satellite_risk_corroboration": {
    "ndvi_trend": "string",
    "soil_moisture_status": "string",
    "weather_risk_factor": "string"
  },
  "uncertainty_range": {
    "yield_loss_low_pct": 0.0,
    "yield_loss_high_pct": 0.0,
    "confidence_level": 0.0
  }
}
Be conservative. Flag uncertainty. Express all money in ZAR and USD.`;

const SYS_RECOMMENDATION = `You are abfAgri's product recommendation engine for SADC fertilizer producers.
Select the top 3 products from the catalogue. Rank by yield recovery potential × producer margin.
Return ONLY valid JSON — no markdown, no explanation:
{
  "recommendations": [
    {
      "rank": 1,
      "product_name": "exact name from catalogue",
      "sku_code": "string",
      "active_ingredient": "string",
      "rate": 0.0,
      "rate_unit": "kg/ha|L/ha|ml/ha|g/ha",
      "application_method": "top_dress|broadcast|foliar_spray|fertigation|in-furrow|side_dress",
      "timing": "e.g. Apply within 48h of diagnosis",
      "estimated_cost_zar_per_ha": 0.0,
      "projected_yield_recovery_pct": 0.0,
      "net_gain_zar_per_ha": 0.0,
      "producer_margin_zar_per_ha": 0.0,
      "complementary_products": [{"product_name": "string", "sku_code": "string", "reason": "string"}]
    }
  ],
  "application_window_hours": 48,
  "agronomic_rationale": "plain-language explanation for farmer",
  "follow_up_action": {
    "days_after_application": 7,
    "action": "string",
    "product_if_needed": "string"
  }
}
Reference product names EXACTLY as they appear in the catalogue. Include net_gain as revenue recovered minus product cost.`;

// ── SADC COMMODITY PRICES (SAFEX defaults, ZAR/ton) ───────────────────────────

const COMMODITY_PRICES = {
  maize: 3800, maize_white: 3800, maize_yellow: 3600,
  wheat: 5200, soybean: 7800, sunflower: 8500,
  sugarcane: 280, cotton: 9500, tobacco: 42000,
  sorghum: 3200, potato: 4500, cassava: 2800
};

const SARB_RATE = 18.50;

// ── CAUSAL GRAPH (fallback consequence values) ─────────────────────────────────

const CAUSAL_GRAPH = {
  NUTRIENT_N_DEF:          { mild: 0.05, moderate: 0.15, severe: 0.25, critical: 0.40, recovery_48h: 0.92, ttc: { mild:14, moderate:7, severe:4, critical:2 } },
  NUTRIENT_P_DEF:          { mild: 0.04, moderate: 0.12, severe: 0.22, critical: 0.35, recovery_48h: 0.88, ttc: { mild:21, moderate:14, severe:7, critical:4 } },
  NUTRIENT_K_DEF:          { mild: 0.06, moderate: 0.14, severe: 0.23, critical: 0.38, recovery_48h: 0.85, ttc: { mild:18, moderate:10, severe:5, critical:3 } },
  PEST_FAW:                { mild: 0.08, moderate: 0.20, severe: 0.40, critical: 0.70, recovery_48h: 0.80, ttc: { mild:7, moderate:4, severe:2, critical:1 } },
  DISEASE_GREY_LEAF_SPOT:  { mild: 0.05, moderate: 0.15, severe: 0.35, critical: 0.55, recovery_48h: 0.75, ttc: { mild:10, moderate:6, severe:3, critical:2 } },
  WATER_STRESS:            { mild: 0.06, moderate: 0.18, severe: 0.30, critical: 0.50, recovery_48h: 0.70, ttc: { mild:14, moderate:7, severe:3, critical:2 } },
  OTHER:                   { mild: 0.05, moderate: 0.12, severe: 0.20, critical: 0.35, recovery_48h: 0.75, ttc: { mild:14, moderate:7, severe:4, critical:2 } }
};

// ── HELPERS ────────────────────────────────────────────────────────────────────

function extractJSON(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function fallbackConsequence(diagnosis, fieldAreaHa, expectedYieldTpha, commodityPriceZar) {
  const code = diagnosis.condition_code || 'OTHER';
  const severity = diagnosis.severity || 'moderate';
  const graph = CAUSAL_GRAPH[code] || CAUSAL_GRAPH.OTHER;
  const yieldLossPct = (graph[severity] || 0.15) * 100;
  const yieldAtRiskTon = fieldAreaHa * expectedYieldTpha * (yieldLossPct / 100);
  const revenueZar = yieldAtRiskTon * commodityPriceZar;
  return {
    consequence_chain: [
      `${diagnosis.condition} detected at ${severity} severity`,
      `Physiological stress → reduced photosynthesis / nutrient uptake`,
      `Projected ${yieldLossPct.toFixed(1)}% yield loss over 7 days if untreated`,
      `${fieldAreaHa} ha × ${expectedYieldTpha} t/ha × R${commodityPriceZar}/ton = R${Math.round(revenueZar).toLocaleString()} revenue at risk`
    ],
    yield_loss_pct: yieldLossPct,
    yield_at_risk_ton: Math.round(yieldAtRiskTon * 10) / 10,
    revenue_at_risk_zar: Math.round(revenueZar),
    revenue_at_risk_usd: Math.round(revenueZar / SARB_RATE),
    time_to_critical_days: graph.ttc[severity] || 7,
    recovery_if_treated_now_pct: graph.recovery_48h * 100,
    intervention_window: graph.ttc[severity] <= 2 ? 'critical_48h' : graph.ttc[severity] <= 7 ? 'urgent_7d' : 'recommended_14d',
    satellite_risk_corroboration: {
      ndvi_trend: diagnosis.satellite_corroboration?.ndvi_value < 0.45 ? 'Below warning threshold' : 'Within normal range',
      soil_moisture_status: 'Derived from field data',
      weather_risk_factor: 'SADC seasonal pattern'
    },
    uncertainty_range: {
      yield_loss_low_pct: yieldLossPct * 0.6,
      yield_loss_high_pct: yieldLossPct * 1.5,
      confidence_level: diagnosis.confidence || 0.65
    }
  };
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

// ── MAIN HANDLER ───────────────────────────────────────────────────────────────

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = corsHeaders();

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), { status: 400, headers });
  }

  const {
    crop_type        = 'maize',
    country          = 'ZA',
    province_or_district = '',
    field_area_ha    = 10,
    growth_stage     = '',
    ndvi_value,
    ndvi_anomaly_pct,
    soil_moisture_pct,
    image_description = '',
    producer_catalogue = [],
    commodity_price_zar_per_ton,
    expected_yield_ton_per_ha = 6
  } = body;

  const commodityPrice = commodity_price_zar_per_ton
    || COMMODITY_PRICES[crop_type.toLowerCase()]
    || COMMODITY_PRICES.maize;

  try {

    // ── AGENT 1: CROP DIAGNOSIS ──────────────────────────────────────────────
    const diagnosisUserMsg = [
      `SADC field assessment:`,
      `- Crop: ${crop_type} | Country: ${country} | District: ${province_or_district}`,
      `- Growth stage: ${growth_stage || 'not specified'}`,
      `- Field area: ${field_area_ha} ha`,
      ndvi_value != null ? `- Current NDVI: ${ndvi_value} (${ndvi_anomaly_pct != null ? ndvi_anomaly_pct + '% vs seasonal baseline' : 'anomaly unknown'})` : '',
      soil_moisture_pct != null ? `- Soil moisture: ${soil_moisture_pct}% of field capacity` : '',
      image_description ? `- Field observations: ${image_description}` : '',
      `\nDiagnose the primary crop stress condition.`
    ].filter(Boolean).join('\n');

    const diagRaw = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: SYS_DIAGNOSIS },
        { role: 'user', content: diagnosisUserMsg }
      ],
      max_tokens: 900
    });

    const diagnosis = extractJSON(diagRaw.response) || {
      condition: 'Unable to diagnose — insufficient field data',
      condition_code: 'OTHER',
      confidence: 0.30,
      severity: 'mild',
      causal_chain: ['Insufficient data for confident diagnosis — provide NDVI or field observations'],
      affected_area_pct: 0,
      urgency_hours: 72,
      satellite_corroboration: { ndvi_value: ndvi_value || null, ndvi_anomaly_pct: ndvi_anomaly_pct || null, soil_moisture_anomaly_pct: null },
      secondary_conditions: []
    };

    // ── AGENT 2: CONSEQUENCE MODEL ───────────────────────────────────────────
    const consequenceUserMsg = [
      `CROP DIAGNOSIS RESULT:`,
      `- Condition: ${diagnosis.condition} [${diagnosis.condition_code}]`,
      `- Severity: ${diagnosis.severity} | Confidence: ${Math.round((diagnosis.confidence || 0.5) * 100)}%`,
      `- Affected area: ${diagnosis.affected_area_pct || 'unknown'}% of field`,
      `- Causal chain: ${(diagnosis.causal_chain || []).join(' → ')}`,
      ``,
      `FIELD ECONOMICS:`,
      `- Field: ${field_area_ha} ha | Crop: ${crop_type} | Country: ${country}`,
      `- Expected yield: ${expected_yield_ton_per_ha} t/ha`,
      `- Commodity price: R ${commodityPrice}/ton (SAFEX)`,
      `- SARB rate: 1 USD = R ${SARB_RATE}`,
      ``,
      `Compute consequences of 7 days of inaction.`
    ].join('\n');

    const consRaw = await env.AI.run('@cf/mistral/mistral-7b-instruct-v0.1', {
      messages: [
        { role: 'system', content: SYS_CONSEQUENCE },
        { role: 'user', content: consequenceUserMsg }
      ],
      max_tokens: 1200
    });

    const consequence = extractJSON(consRaw.response)
      || fallbackConsequence(diagnosis, field_area_ha, expected_yield_ton_per_ha, commodityPrice);

    // ── AGENT 3: PRODUCT RECOMMENDATION ─────────────────────────────────────
    let recommendation = null;
    if (Array.isArray(producer_catalogue) && producer_catalogue.length > 0) {
      const recUserMsg = [
        `DIAGNOSIS: ${diagnosis.condition} | Severity: ${diagnosis.severity}`,
        `CONSEQUENCE: ${consequence.yield_loss_pct?.toFixed(1) || '?'}% yield loss risk`,
        `Revenue at risk: R ${Math.round(consequence.revenue_at_risk_zar || 0).toLocaleString()}`,
        `Intervention window: ${consequence.intervention_window}`,
        `Field: ${field_area_ha} ha | Crop: ${crop_type} | Country: ${country}`,
        `Growth stage: ${growth_stage || 'not specified'}`,
        ``,
        `PRODUCER CATALOGUE (select from these only):`,
        JSON.stringify(producer_catalogue.slice(0, 8), null, 2),
        ``,
        `Recommend top 3 products. Maximise yield recovery then producer margin.`
      ].join('\n');

      const recRaw = await env.AI.run('@cf/microsoft/phi-3-mini-128k-instruct', {
        messages: [
          { role: 'system', content: SYS_RECOMMENDATION },
          { role: 'user', content: recUserMsg }
        ],
        max_tokens: 1000
      });

      recommendation = extractJSON(recRaw.response);
    }

    // ── RESPONSE ─────────────────────────────────────────────────────────────
    return new Response(JSON.stringify({
      success: true,
      pipeline: 'abfAgri · 4-agent consequence model',
      version: '1.0.0',
      diagnosis,
      consequence,
      recommendation,
      meta: {
        crop_type,
        country,
        field_area_ha,
        expected_yield_ton_per_ha,
        commodity_price_zar_per_ton: commodityPrice,
        sarb_usd_rate: SARB_RATE,
        agents_run: recommendation ? 3 : 2,
        timestamp: new Date().toISOString()
      }
    }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      hint: 'Ensure the AI binding is configured: Pages → Settings → Functions → AI Bindings → name: AI'
    }), { status: 500, headers });
  }
}
