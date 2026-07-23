// A model backend implements one function: async callModel({ systemPrompt,
// userPrompt, model, options }) -> Promise<string>. This is the local
// Ollama backend, matching local-llm-lab's own setup (verified against a
// real request/response shape, not assumed from docs). Writing a different
// backend (an API model) means implementing the same signature and
// pointing --backend at it - see README.md's "Writing a backend" section.

const DEFAULT_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

export async function callModel({ systemPrompt, userPrompt, model, options = {} }) {
  const res = await fetch(`${DEFAULT_HOST}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      // Deterministic decoding, matching local-llm-lab's own calibration
      // setup: a judge whose verdict changes run to run on identical input
      // can't be calibrated against anything.
      options: { temperature: 0, seed: 42, top_p: 1, ...options },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ollama request failed: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`);
  }

  const data = await res.json();
  if (typeof data.response !== 'string') {
    throw new Error(`ollama response missing "response" field: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.response;
}
