/**
 * abfAgri — Demo Consequence Report
 * GET /api/demo
 * Returns a pre-computed sample output for the landing page live preview.
 */
export async function onRequestGet() {
  return new Response(JSON.stringify({
    success: true,
    pipeline: 'abfAgri · demo consequence report',
    diagnosis: {
      condition: 'Nitrogen deficiency',
      condition_code: 'NUTRIENT_N_DEF',
      confidence: 0.87,
      severity: 'severe',
      causal_chain: [
        'Low available soil nitrogen detected',
        'Reduced chlorophyll synthesis → pale green / yellowing leaves (interveinal chlorosis)',
        'Decreased photosynthesis rate → reduced dry matter accumulation',
        'Stunted growth → premature leaf senescence',
        'Grain fill impairment → yield loss'
      ],
      affected_area_pct: 68,
      urgency_hours: 48,
      satellite_corroboration: {
        ndvi_value: 0.31,
        ndvi_anomaly_pct: -38.2,
        soil_moisture_anomaly_pct: -18.0,
        data_source: 'Sentinel-2 satellite intelligence'
      },
      secondary_conditions: [
        { condition: 'Mild water stress', confidence: 0.42 }
      ]
    },
    consequence: {
      consequence_chain: [
        'Nitrogen deficiency (severe) diagnosed in V6 maize — Limpopo, RSA',
        'N deficiency → reduced chlorophyll synthesis → NDVI decline from 0.51 to 0.31 (−39%) over 7 days',
        'Photosynthesis rate reduced by ~35% → dry matter accumulation impaired',
        'If untreated: 25% yield loss projected on 60 ha field',
        '60 ha × 6.8 t/ha × 25% loss = 102 t yield at risk',
        '102 t × R 3,800/ton = R 387,600 revenue at risk'
      ],
      yield_loss_pct: 25.0,
      yield_at_risk_ton: 102.0,
      revenue_at_risk_zar: 387600,
      revenue_at_risk_usd: 20951,
      time_to_critical_days: 4,
      recovery_if_treated_now_pct: 92.0,
      intervention_window: 'critical_48h',
      satellite_risk_corroboration: {
        ndvi_trend: 'Declining −0.08/week — approaching critical threshold (0.30)',
        soil_moisture_status: '18% below seasonal average — sub-optimal for recovery',
        weather_risk_factor: 'No rain forecast 72h — optimal window for top-dress application'
      },
      uncertainty_range: {
        yield_loss_low_pct: 18.0,
        yield_loss_high_pct: 32.0,
        confidence_level: 0.83
      }
    },
    recommendation: {
      recommendations: [
        {
          rank: 1,
          product_name: 'Omnia LAN 28%',
          sku_code: 'OMN-LAN28-50KG',
          active_ingredient: 'Ammonium nitrate 28% N',
          rate: 150,
          rate_unit: 'kg/ha',
          application_method: 'top_dress',
          timing: 'Apply within 48 hours — no rain forecast, ideal soil conditions',
          estimated_cost_zar_per_ha: 1560,
          projected_yield_recovery_pct: 92.0,
          net_gain_zar_per_ha: 4900,
          producer_margin_zar_per_ha: 320,
          complementary_products: [
            { product_name: 'Omnia Nitrate Boost', sku_code: 'OMN-NB-5L', reason: 'Foliar N supplement accelerates leaf recovery Day 3–5' }
          ]
        },
        {
          rank: 2,
          product_name: 'Omnia Nitrosol Liquid N',
          sku_code: 'OMN-NS-20L',
          active_ingredient: 'Urea ammonium nitrate 32% N',
          rate: 30,
          rate_unit: 'L/ha',
          application_method: 'foliar_spray',
          timing: 'Apply Day 1–3, early morning. Follow with LAN broadcast Day 5.',
          estimated_cost_zar_per_ha: 2100,
          projected_yield_recovery_pct: 85.0,
          net_gain_zar_per_ha: 4200,
          producer_margin_zar_per_ha: 280,
          complementary_products: []
        },
        {
          rank: 3,
          product_name: 'Omnia Flexi-N',
          sku_code: 'OMN-FLX-1T',
          active_ingredient: 'Controlled-release nitrogen blend',
          rate: 120,
          rate_unit: 'kg/ha',
          application_method: 'broadcast',
          timing: 'Apply within 72h. Controlled-release reduces leaching risk.',
          estimated_cost_zar_per_ha: 2640,
          projected_yield_recovery_pct: 80.0,
          net_gain_zar_per_ha: 3650,
          producer_margin_zar_per_ha: 260,
          complementary_products: []
        }
      ],
      application_window_hours: 48,
      agronomic_rationale: 'Severe N deficiency at V6 requires immediate top-dress. LAN 28% provides fast-acting ammonium nitrate — split-form N ensures both quick uptake and sustained release through grain fill. Apply before the 72h window closes to secure 92% recovery. Net gain R 4,900/ha vs product cost of R 1,560/ha.',
      follow_up_action: {
        days_after_application: 10,
        action: 'Scout for fall armyworm and assess NDVI recovery via satellite',
        product_if_needed: 'Omnia ArmourUp insecticide if FAW pressure observed'
      }
    },
    meta: {
      crop_type: 'maize',
      country: 'ZA',
      province: 'Limpopo',
      field_area_ha: 60,
      expected_yield_ton_per_ha: 6.8,
      commodity_price_zar_per_ton: 3800,
      sarb_usd_rate: 18.50,
      agents_run: 3,
      timestamp: new Date().toISOString()
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
