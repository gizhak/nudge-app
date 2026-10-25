// Cloudflare Worker: analyzes a meal photo or description with Claude and returns estimated nutrition.
// Secrets (set in the Cloudflare dashboard, never in code): ANTHROPIC_API_KEY, APP_TOKEN.
// Optional variable: MODEL (defaults to claude-sonnet-5-5).

const MAX_IMAGE_BASE64 = 6_000_000; // ~4.5 MB image

const MEAL_TOOL = {
  name: 'record_meal',
  description: 'Record the estimated nutrition of the meal, one entry per distinct food item.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Short food name in Hebrew' },
            grams: { type: 'number', description: 'Estimated edible weight in grams' },
            kcal: { type: 'number' },
            protein_g: { type: 'number' },
            carbs_g: { type: 'number' },
            fat_g: { type: 'number' },
          },
          required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
        },
      },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      note: { type: 'string', description: 'One short Hebrew sentence on what drives the uncertainty, if any' },
    },
    required: ['items', 'confidence'],
  },
};

const SYSTEM = `You estimate the nutrition of a single meal for a calorie and protein tracking app used in Israel.
Identify each distinct food item, estimate its edible weight in grams from visual cues (plate size, utensils, typical portions), and give kcal, protein, carbs and fat for that weight.
Use standard nutrition values for the food as typically prepared in Israel. Account for visible oil, sauces and dressings.
If the input is not food, return an empty items list with low confidence.
Item names must be short and in Hebrew. Always answer by calling the record_meal tool.`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true });
    if (request.method !== 'POST' || url.pathname !== '/analyze') return json({ error: 'not_found' }, 404);
    if (!env.APP_TOKEN || request.headers.get('x-app-token') !== env.APP_TOKEN) return json({ error: 'unauthorized' }, 401);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'server_not_configured' }, 500);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad_json' }, 400);
    }
    const { image, text } = body ?? {};
    if (!image && !text) return json({ error: 'empty_request' }, 400);
    if (image && (typeof image !== 'string' || image.length > MAX_IMAGE_BASE64)) return json({ error: 'image_too_large' }, 413);

    const content = [];
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } });
    content.push({
      type: 'text',
      text: text ? `Meal description from the user: ${String(text).slice(0, 500)}` : 'Estimate the nutrition of this meal.',
    });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.MODEL || 'claude-sonnet-5-5',
        max_tokens: 1024,
        system: SYSTEM,
        tools: [MEAL_TOOL],
        tool_choice: { type: 'tool', name: 'record_meal' },
        messages: [{ role: 'user', content }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: 'model_error', status: res.status, detail: detail.slice(0, 300) }, 502);
    }
    const data = await res.json();
    const call = (data.content ?? []).find((b) => b.type === 'tool_use' && b.name === 'record_meal');
    if (!call) return json({ error: 'no_result' }, 502);
    return json(call.input);
  },
};
