/**
 * app.js — Smart Recipe Finder
 * Menggunakan Google Gemini API (gemini-2.5-flash)
 * API Key dibaca dari config.js (di-gitignore, tidak di-commit)
 */

/* ──────────────────────────────────────────────
   CONFIG & MODELS
   Menggunakan model Gemini yang aktif dan stabil dengan auto-fallback.
   Jika model utama sedang high demand (503), otomatis beralih ke model cadangan.
──────────────────────────────────────────────── */
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
];

const EXAMPLE_PACKS = {
  'Paket Nasi Goreng': 'nasi putih, telur, bawang merah, bawang putih, kecap manis, minyak goreng, garam',
  'Paket Sayur':       'bayam, wortel, tahu, tempe, bawang putih, garam, minyak',
  'Paket Ayam':        'ayam, bawang merah, bawang putih, jahe, kunyit, santan, daun salam',
  'Paket Mie':         'mie instan, telur, sawi hijau, bawang putih, kecap asin, minyak wijen',
  'Paket Telor':       'telur, tomat, bawang merah, cabai, garam, minyak goreng',
};

/* ──────────────────────────────────────────────
   INIT: Baca key dari config.js
──────────────────────────────────────────────── */
function getApiKey() {
  if (typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY &&
      CONFIG.GEMINI_API_KEY !== 'ISI_API_KEY_GEMINI_KAMU_DI_SINI') {
    return CONFIG.GEMINI_API_KEY;
  }
  // Fallback: session storage (jika user input manual)
  return sessionStorage.getItem('gemini_api_key') || '';
}

function initApiNotice() {
  const notice = document.getElementById('apiNotice');
  if (!notice) return;

  const key = getApiKey();
  if (key) {
    notice.className = 'api-notice ok';
    notice.innerHTML = '<strong>✅ API Key siap</strong> — dibaca dari <code>config.js</code> (Auto-fallback Gemini Model aktif).';
  } else {
    notice.innerHTML = `
      <strong>⚙️ API Key Gemini belum dikonfigurasi</strong><br>
      Buka file <code>config.js</code> dan isi <code>GEMINI_API_KEY</code> dengan key dari
      <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#1a73e8">Google AI Studio</a>.
      <br><br>Atau masukkan sementara di sini:
      <div class="key-row">
        <input type="password" class="key-input" id="apiKeyInput" placeholder="Masukkan API Key Gemini..." />
        <button class="btn-save-key" onclick="saveApiKey()">Simpan Sesi</button>
      </div>
      <small style="opacity:.65;display:block;margin-top:6px">Key sementara hanya disimpan di sessionStorage browser, tidak ditulis ke disk.</small>
    `;
  }
}

function saveApiKey() {
  const val = document.getElementById('apiKeyInput')?.value.trim();
  if (!val) return;
  sessionStorage.setItem('gemini_api_key', val);
  const notice = document.getElementById('apiNotice');
  notice.className = 'api-notice ok';
  notice.innerHTML = '<strong>✅ API Key tersimpan</strong> — aktif untuk sesi ini.';
}

/* ──────────────────────────────────────────────
   QUICK FILL CHIPS
──────────────────────────────────────────────── */
function addExample(pack) {
  const ta = document.getElementById('ingredientInput');
  if (ta) ta.value = EXAMPLE_PACKS[pack] || '';
}

/* ──────────────────────────────────────────────
   PROMPT BUILDER
──────────────────────────────────────────────── */
function buildPrompt(ingredients) {
  return `Kamu adalah chef profesional, ahli gizi, dan pakar kuliner berbahasa Indonesia yang membantu pengguna memasak menggunakan bahan yang mereka miliki.

Bahan yang dimiliki pengguna: ${ingredients}

Tugas kamu: Berikan TEPAT 3 rekomendasi resep dalam format JSON berikut. Jangan tambahkan teks lain di luar blok JSON, jangan bungkus dengan markdown code fence.

Jika bahan sangat terbatas, tetap buat resep dan tambahkan bahan tambahan di "ingredients_extra".
Jika input mengandung bahan berbahaya atau non-makanan, isi "error" dengan pesan penolakan sopan dalam Bahasa Indonesia dan kosongkan "recipes".

Format JSON:
{
  "error": null,
  "recipes": [
    {
      "name": "Nama Masakan",
      "time": "X menit",
      "description": "Deskripsi singkat yang menggugah selera, 1-2 kalimat.",
      "ingredients_have": ["bahan1 dari daftar pengguna", "bahan2"],
      "ingredients_extra": ["bahan tambahan yang tidak dimiliki pengguna, boleh kosong []"],
      "steps": [
        "Panaskan wajan...",
        "Tumis bawang...",
        "Masukkan bahan utama...",
        "Koreksi rasa dan sajikan."
      ]
    }
  ]
}

Aturan penting:
- Bahasa Indonesia yang natural, hangat, dan menyenangkan
- "ingredients_have" hanya berisi bahan yang ADA di daftar pengguna dan dipakai resep ini
- "ingredients_extra" berisi bahan yang TIDAK ada di daftar pengguna tapi diperlukan (garam, minyak, dll)
- Minimal 4 langkah memasak per resep
- Deskripsi harus menggugah selera dan kreatif`;
}

/* ──────────────────────────────────────────────
   API REQUEST WITH AUTO-FALLBACK
──────────────────────────────────────────────── */
async function callGeminiWithFallback(apiKey, promptText) {
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      console.log(`[Smart Recipe Finder] Menghubungi model: ${model}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: promptText }],
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `HTTP ${response.status}`;
        console.warn(`[Smart Recipe Finder] Model ${model} gagal (${errMsg}). Beralih ke model cadangan...`);
        lastError = new Error(errMsg);
        continue; // Coba model berikutnya
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!rawText) {
        console.warn(`[Smart Recipe Finder] Model ${model} memberikan teks kosong. Beralih ke model cadangan...`);
        lastError = new Error('Respons model kosong');
        continue;
      }

      console.log(`[Smart Recipe Finder] Berhasil mendapatkan respons dari model: ${model}`);
      return { rawText, model };

    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      const msg = isTimeout ? 'Timeout (15s)' : err.message;
      console.warn(`[Smart Recipe Finder] Model ${model} mengalami kendala: ${msg}. Beralih ke model cadangan...`);
      lastError = new Error(msg);
    }
  }

  throw lastError || new Error('Semua model Gemini sedang tidak dapat diakses.');
}

/* ──────────────────────────────────────────────
   MAIN: FIND RECIPES
──────────────────────────────────────────────── */
async function findRecipes() {
  const raw = document.getElementById('ingredientInput').value.trim();
  if (!raw) {
    showError('Tolong masukkan bahan-bahan yang kamu punya terlebih dahulu ya! 🥕');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    showError('API Key Gemini belum diisi. Buka config.js dan isi GEMINI_API_KEY kamu.');
    return;
  }

  setState('loading');

  const loadingPhrases = [
    'AI sedang menganalisis bahan-bahanmu...',
    'Mencocokkan kombinasi bahan terbaik...',
    'Menyusun langkah-langkah memasak...',
    'Hampir selesai, tinggal sebentar lagi!',
  ];
  let phraseIdx = 0;
  const phraseTimer = setInterval(() => {
    phraseIdx = (phraseIdx + 1) % loadingPhrases.length;
    const el = document.getElementById('loadingText');
    if (el) el.textContent = loadingPhrases[phraseIdx];
  }, 1800);

  try {
    const { rawText, model } = await callGeminiWithFallback(apiKey, buildPrompt(raw));

    clearInterval(phraseTimer);

    const parsed = parseRecipeJSON(rawText);

    if (parsed.error) {
      showError(`⚠️ ${parsed.error}`);
      setState('idle');
      return;
    }
    if (!parsed.recipes || parsed.recipes.length === 0) {
      throw new Error('Tidak ada resep yang dihasilkan. Coba tambahkan lebih banyak bahan!');
    }

    renderRecipes(parsed.recipes, raw, model);
    setState('results');

  } catch (e) {
    clearInterval(phraseTimer);
    console.error('[Smart Recipe Finder]', e);
    showError(`Gagal menghubungi Gemini API: ${e.message}`);
    setState('idle');
  }
}

/* ──────────────────────────────────────────────
   JSON PARSER (robust & lenient)
──────────────────────────────────────────────── */
function parseRecipeJSON(text) {
  if (!text) return { recipes: [], error: 'Respons kosong dari AI.' };
  try {
    return JSON.parse(text);
  } catch (_) {
    try {
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      return JSON.parse(cleaned);
    } catch (_) {
      try {
        const firstBrace = text.indexOf('{');
        const lastBrace  = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          return JSON.parse(text.substring(firstBrace, lastBrace + 1));
        }
      } catch (e) {
        console.error('[Smart Recipe Finder] Gagal mem-parse JSON:', e, text);
      }
    }
  }
  return { recipes: [], error: 'Gagal memproses format respons resep. Silakan coba klik cari lagi!' };
}

/* ──────────────────────────────────────────────
   STATE MANAGER
──────────────────────────────────────────────── */
function setState(state) {
  const loading = document.getElementById('loadingWrap');
  const results = document.getElementById('results');
  const btn     = document.getElementById('findBtn');

  loading.classList.toggle('active', state === 'loading');
  results.classList.toggle('active', state === 'results');
  btn.disabled = (state === 'loading');

  if (state === 'loading') {
    btn.innerHTML = 'Sedang mencari...';
  } else {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      Carikan Resep Untukku`;
  }

  if (state === 'results') {
    setTimeout(() => {
      document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

function showError(msg) {
  const el = document.getElementById('errorBanner');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 8000);
}

/* ──────────────────────────────────────────────
   RENDER RECIPES
──────────────────────────────────────────────── */
function renderRecipes(recipes, userIngredients, modelName) {
  const userSet   = new Set(
    userIngredients.toLowerCase().split(',').map(s => s.trim())
  );
  const container = document.getElementById('cardsContainer');
  container.innerHTML = '';

  recipes.slice(0, 3).forEach((recipe, idx) => {
    container.appendChild(buildCard(recipe, idx + 1, userSet));
  });

  const countEl = document.getElementById('resultsCount');
  if (countEl) {
    const modelTag = modelName ? ` · Model: ${modelName}` : '';
    countEl.textContent = `${Math.min(recipes.length, 3)} resep ditemukan${modelTag}`;
  }

  // Auto-open first card
  const first = container.querySelector('.recipe-card');
  if (first) first.classList.add('open');
}

/* ──────────────────────────────────────────────
   BUILD SINGLE RECIPE CARD
──────────────────────────────────────────────── */
function buildCard(recipe, num, userSet) {
  const card     = document.createElement('div');
  card.className = 'recipe-card';

  const hasArr   = recipe.ingredients_have  || [];
  const extraArr = recipe.ingredients_extra || [];

  const ingredientsHTML = hasArr.map(name => {
    const isHas = [...userSet].some(u =>
      name.toLowerCase().includes(u) || u.includes(name.toLowerCase().slice(0, 4))
    );
    return `<div class="ingredient-item ${isHas ? 'has' : ''}">
      <span class="ing-dot"></span>${escHtml(name)}
    </div>`;
  }).join('');

  const extraHTML = extraArr.length ? `
    <div class="extra-ingredients">
      <div class="extra-title">Bahan Tambahan yang Dibutuhkan</div>
      <div class="extra-list">
        ${extraArr.map(e => `<span class="extra-chip">${escHtml(e)}</span>`).join('')}
      </div>
    </div>` : '';

  const stepsHTML = (recipe.steps || []).map((step, i) => `
    <li class="step-item">
      <span class="step-num">${i + 1}</span>
      <span class="step-text">${escHtml(step.replace(/^(Langkah \d+[:.]?\s*)/i, ''))}</span>
    </li>`).join('');

  card.innerHTML = `
    <div class="card-header" onclick="toggleCard(this.closest('.recipe-card'))">
      <div class="card-header-left">
        <div class="recipe-num">Resep #${num}</div>
        <div class="recipe-title">${escHtml(recipe.name)}</div>
        <div class="recipe-meta">
          <span class="meta-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            ${escHtml(recipe.time || '±30 menit')}
          </span>
          <span class="meta-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/>
              <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
            </svg>
            ${hasArr.length} bahan dimiliki
          </span>
          ${extraArr.length
            ? `<span class="meta-chip" style="color:var(--warn)">+${extraArr.length} bahan tambahan</span>`
            : ''}
        </div>
      </div>
      <div class="card-toggle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    </div>
    <div class="card-body">
      <div class="card-desc">${escHtml(recipe.description || '')}</div>

      <div class="section-label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="2"/>
        </svg>
        Bahan-bahan
      </div>
      <div class="ingredients-grid">${ingredientsHTML}</div>
      ${extraHTML}

      <div class="section-label" style="margin-top:22px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="9 11 12 14 22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        Langkah-langkah Memasak
      </div>
      <ul class="steps-list">${stepsHTML}</ul>
    </div>`;

  return card;
}

function toggleCard(card) {
  card.classList.toggle('open');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ──────────────────────────────────────────────
   DOMContentLoaded
──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', initApiNotice);
