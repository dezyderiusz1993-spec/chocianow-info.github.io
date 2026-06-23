const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_QUERY_LENGTH = 300;
const SEARCH_RESULT_COUNT = 10;

function corsHeaders(origin, allowedOrigins) {
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Key",
    "Vary": "Origin",
  };
}

async function braveSearch(query, apiKey) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(SEARCH_RESULT_COUNT));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`Brave Search API error: ${res.status}`);
  }

  const data = await res.json();
  const results = data.web?.results ?? [];
  return results.map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description,
  }));
}

async function synthesizeWithClaude(query, results, apiKey) {
  const sourcesList = results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description}`)
    .join("\n\n");

  const systemPrompt = `Jesteś asystentem researchowym wspierającym śledztwa OSINT (Open Source Intelligence). Analizujesz WYŁĄCZNIE publicznie dostępne wyniki wyszukiwania podane poniżej.

Zasady:
- Korzystaj tylko z informacji zawartych w podanych źródłach. Nie zgaduj i nie wymyślaj faktów.
- Cytuj źródła numerami w nawiasach kwadratowych, np. [1], [2], odpowiadającymi numeracji poniżej.
- Jeśli źródła są niewystarczające, sprzeczne albo niewiarygodne, wyraźnie to zaznacz.
- Oddzielaj fakty potwierdzone w wielu źródłach od pojedynczych/niepotwierdzonych wzmianek.
- Nie podawaj danych umożliwiających nielegalne działania (np. łamanie zabezpieczeń, dostęp do prywatnych danych) — opieraj się tylko na danych jawnych.
- Odpowiadaj w języku polskim, w formie krótkiego raportu śledczego: streszczenie, kluczowe ustalenia z cytatami, niejasności/braki.`;

  const userPrompt = `Zapytanie śledcze: "${query}"\n\nŹródła:\n\n${sourcesList}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
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
      const results = await braveSearch(query, env.BRAVE_API_KEY);
      const report = results.length
        ? await synthesizeWithClaude(query, results, env.ANTHROPIC_API_KEY)
        : "Nie znaleziono wyników wyszukiwania dla tego zapytania.";

      return new Response(JSON.stringify({ query, report, sources: results }), {
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
