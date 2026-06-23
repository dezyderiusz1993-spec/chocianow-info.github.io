// Adres Twojego wdrożonego Cloudflare Workera (worker/), np.:
// "https://ai-investigation-search.<twoja-subdomena>.workers.dev"
const WORKER_URL = "https://REPLACE-WITH-YOUR-WORKER-URL.workers.dev";

const form = document.getElementById("search-form");
const queryInput = document.getElementById("query");
const statusEl = document.getElementById("status");
const reportSection = document.getElementById("report-section");
const reportEl = document.getElementById("report");
const sourcesSection = document.getElementById("sources-section");
const sourcesEl = document.getElementById("sources");
const submitBtn = form.querySelector("button");

function getAccessKey() {
  let key = localStorage.getItem("accessKey");
  if (!key) {
    key = prompt("Wpisz klucz dostępu:");
    if (key) localStorage.setItem("accessKey", key);
  }
  return key;
}

function setStatus(message) {
  statusEl.hidden = !message;
  statusEl.textContent = message || "";
}

function renderResults(data) {
  reportEl.textContent = data.report;
  reportSection.hidden = false;

  sourcesEl.innerHTML = "";
  data.sources.forEach((src) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = src.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = src.title || src.url;
    li.appendChild(a);
    if (src.description) {
      const desc = document.createElement("div");
      desc.className = "desc";
      desc.textContent = src.description;
      li.appendChild(desc);
    }
    sourcesEl.appendChild(li);
  });
  sourcesSection.hidden = data.sources.length === 0;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;

  const accessKey = getAccessKey();
  if (!accessKey) return;

  submitBtn.disabled = true;
  reportSection.hidden = true;
  sourcesSection.hidden = true;
  setStatus("Szukam i analizuję...");

  try {
    const res = await fetch(`${WORKER_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": accessKey,
      },
      body: JSON.stringify({ query }),
    });

    if (res.status === 401) {
      localStorage.removeItem("accessKey");
      throw new Error("Niepoprawny klucz dostępu. Odśwież stronę i wpisz go ponownie.");
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Nieznany błąd");
    }

    setStatus("");
    renderResults(data);
  } catch (err) {
    setStatus(`Błąd: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
  }
});
