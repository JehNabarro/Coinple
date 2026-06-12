const API_URL = 'https://api.anthropic.com/v1/messages';

async function analyzeReceipt(base64Image, mediaType, apiKey, categories) {
  const catNames = categories.map(c => c.name).join(', ');

  const body = {
    model: 'claude-opus-4-8',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64Image }
        },
        {
          type: 'text',
          text: `Analisa este recibo/nota fiscal e extrai as informações. Responde APENAS com JSON válido, sem texto extra:
{"amount": <número decimal>, "establishment": "<nome>", "date": "<YYYY-MM-DD>", "suggestedCategory": "<categoria>"}

Categorias disponíveis: ${catNames}
Se não encontrares uma data clara, usa a data de hoje.
Se não reconheceres o estabelecimento, usa "Despesa".`
        }
      ]
    }]
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erro API: ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Resposta inválida da IA');

  return JSON.parse(jsonMatch[0]);
}
