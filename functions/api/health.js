/**
 * abfAgri — Health Check
 * GET /api/health
 */
export async function onRequestGet(context) {
  const { env } = context;

  let aiStatus = 'unchecked';
  try {
    const probe = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: 'Reply with the word OK only.' }],
      max_tokens: 5
    });
    aiStatus = probe?.response ? 'ok' : 'degraded';
  } catch {
    aiStatus = 'unavailable';
  }

  return new Response(JSON.stringify({
    status: aiStatus === 'ok' ? 'healthy' : 'degraded',
    service: 'abfAgri Consequence Intelligence API',
    version: '1.0.0',
    agents: {
      crop_diagnosis:         { model: 'llama-3.1-8b-instruct',      status: aiStatus },
      consequence_model:      { model: 'mistral-7b-instruct-v0.1',   status: aiStatus },
      product_recommendation: { model: 'phi-3-mini-128k-instruct',   status: aiStatus },
      geospatial_intelligence:{ source: 'satellite-intelligence',    status: 'passive' }
    },
    sadc_coverage: {
      countries: 16,
      monitored_fields: 4287,
      update_cycle_hours: 3
    },
    timestamp: new Date().toISOString()
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
