const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_QUERY_LENGTH = 300;

function corsHeaders(origin, allowedOrigins) {
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Key",
    "Vary": "Origin",
  };
}

function extractSources(content) {
  const sources = [];
  const seen = new Set();
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    for (const item of block.content ?? []) {
      if (item.type === "web_search_result" && !seen.has(item.url)) {
        seen.add(item.url);
        sources.push({ title: item.title, url: item.url, description: "" });
      }
    }
  }
  return sources;
}

function extractReportText(content) {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

async function investigate(query, apiKey) {
  const systemPrompt = `Jesteś asystentem researchowym wspierającym śledztwa OSINT (Open Source Intelligence). Masz dostęp do narzędzia wyszukiwania w internecie — korzystaj z niego, żeby znaleźć aktualne, publicznie dostępne informacje na podane zapytanie.

Zasady:
- Korzystaj tylko z informacji znalezionych przez wyszukiwanie. Nie zgaduj i nie wymyślaj faktów.
- Cytuj źródła (tytuł/URL), z których pochodzi każde ustalenie.
- Jeśli informacje są niewystarczające, sprzeczne albo niewiarygodne, wyraźnie to zaznacz.
- Oddzielaj fakty potwierdzone w wielu źródłach od pojedynczych/niepotwierdzonych wzmianek.
- Nie podawaj informacji umożliwiających nielegalne działania (np. łamanie zabezpieczeń, dostęp do prywatnych/niepublicznych danych) — opieraj się tylko na danych jawnych.
- Odpowiadaj w języku polskim, w formie krótkiego raportu śledczego: streszczenie, kluczowe ustalenia z cytatami, niejasności/braki.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: query }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 6,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return {
    report: extractReportText(data.content ?? []),
    sources: extractSources(data.content ?? []),
  };
}

export default {
  async fetch(request, env) {
    const allowedOrigins = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/search" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers });
    }

    const accessKey = request.headers.get("X-Access-Key");
    if (!env.ACCESS_KEY || accessKey !== env.ACCESS_KEY) {
      return new Response(JSON.stringify({ error: "Brak autoryzacji" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Niepoprawny JSON" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const query = (body.query || "").trim();
    if (!query || query.length > MAX_QUERY_LENGTH) {
      return new Response(JSON.stringify({ error: "Niepoprawne zapytanie" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    try {
      const { report, sources } = await investigate(query, env.ANTHROPIC_API_KEY);
      return new Response(JSON.stringify({ query, report, sources }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
  },
};
