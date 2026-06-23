# chocianow-info.github.io

## Wyszukiwarka śledcza (AI + OSINT)

Frontend (`index.html`, `assets/`) jest hostowany przez GitHub Pages i wywołuje backend
w postaci Cloudflare Workera (`worker/`), który:

1. wysyła zapytanie do **Claude (Anthropic API)** z włączonym wbudowanym narzędziem wyszukiwania w internecie — model sam wyszukuje i analizuje wyniki,
2. zwraca raport śledczy razem z listą źródeł, które wykorzystał,
3. chroni dostęp kluczem (`X-Access-Key`), żeby tylko właściciel mógł z tego korzystać.

Wystarczy jeden klucz API (Anthropic) — nie jest potrzebny żaden dodatkowy klucz do wyszukiwarki.

### Wdrożenie backendu (Cloudflare Worker)

Wymagania: konto Cloudflare (darmowe), [wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
i klucz Anthropic API (https://console.anthropic.com/).

```bash
cd worker
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ACCESS_KEY      # własne hasło dostępu do wyszukiwarki
npx wrangler deploy
```

Po wdrożeniu `wrangler deploy` wypisze adres workera
(np. `https://ai-investigation-search.<subdomena>.workers.dev`).

### Konfiguracja frontendu

Wklej adres workera w `assets/app.js`, w linii:

```js
const WORKER_URL = "https://REPLACE-WITH-YOUR-WORKER-URL.workers.dev";
```

Przy pierwszym wyszukiwaniu strona poprosi o klucz dostępu (ten ustawiony jako `ACCESS_KEY`)
i zapamięta go w `localStorage` przeglądarki.

### Zakres i ograniczenia

Narzędzie korzysta wyłącznie z publicznie dostępnych wyników wyszukiwania (wbudowane
wyszukiwanie w Anthropic API) i AI do ich syntezy. Nie wykonuje nieautoryzowanego dostępu
do systemów, nie omija zabezpieczeń i nie scrapuje stron z naruszeniem ich warunków korzystania.