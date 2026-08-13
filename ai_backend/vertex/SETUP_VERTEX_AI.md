# 🧩 Vertex AI Agent Builder — ₹91,785 ($1,000) credit ko USE karne ka Setup Guide

Ye guide aapke Google Cloud **Vertex AI Agent Builder** trial promo credit
(**₹91,785.01 ≈ $1,000 USD**, valid **1 March 2027** tak) ko StudyGyaan pe
sach me consume karwata hai.

> ⚠️ **Sabse zaroori baat:** ye credit **SIRF** GenAI App Builder / Vertex AI
> Agent Builder (Discovery Engine) SKUs pe chalta hai. **Standard Gemini API /
> AI Studio is credit ko NAHI kaate.** Isliye hum yahan Gemini API use NAHI
> karte — hum **Vertex AI Search (RAG) + Conversational agents** use karte hain,
> jo is credit ke eligible hain.

---

## 1. Kya kya banega (naya feature)

1. **StudyGyaan AI Sathi** — ek RAG-based conversational assistant jo site ke
   apne jobs/blogs/articles se **grounded** answers deta hai (sources ke saath).
2. **Enterprise Search** — jobs/blogs me grounded search.
3. **Auto-ingestion** — Firestore ke published content ko Vertex data store me
   import karta hai (document ingestion SKU = credit kaat-ta hai).
4. **Credit dashboard** — kitna ₹91,785 bacha, wo Firestore ledger me.

Sab kuch **non-invasive** hai — existing program (govt_jobs, auto_blog, articles)
**bilkul nahi toota**; Vertex configured na ho to sab gracefully skip hota hai.

---

## 2. Google Cloud console me setup (ek baar, ~15 min)

1. [console.cloud.google.com](https://console.cloud.google.com) → apna project
   kholo (project id note karo = `VERTEX_PROJECT_ID`).
2. **Enable APIs** (APIs & Services → Enable APIs and Services):
   - `discoveryengine.googleapis.com` (Discovery Engine / Agent Builder)
   - `cloudbuild.googleapis.com` (jaruri ho to)
3. **Vertex AI Agent Builder** → [Agent Builder console](https://console.cloud.google.com/gen-app-builder):
   - **Data Store** → **Create** → type: **Search** (ya Chat), region **global**.
   - Data store ke naam/id note karo = `VERTEX_DATA_STORE_ID`.
   - Data store bante hi ek **default_search serving config** ban jaati hai
     (uska naam bhi note karo, default `default_search`).
4. **(Recommended) Engines** (Chat agent ke liye) — Agent Builder → Engines →
   create → type **Conversational Search / Agent**. Engine id = `VERTEX_ENGINE_ID`
   (optional — data store ka chat bhi kaafi hai).

> 💡 Provisioning ke baad data store ke **Documents** tab me ek sample doc
> manually daal ke search test kar sakte ho. Fir neeche ka `--ingest` chalao.

---

## 3. Env / Secrets set karo

`ai_backend/.env` (local) **aur** GitHub Secrets me same values:

```
SERVICE_ACCOUNT_JSON=<pehle se hai — isi se auth hota hai>
VERTEX_PROJECT_ID=<Google Cloud project id>
VERTEX_LOCATION=global
VERTEX_DATA_STORE_ID=<data store id>
VERTEX_SERVING_CONFIG=default_search
# optional:
#VERTEX_ENGINE_ID=<engine id>
#VERTEX_CREDIT_BUDGET_INR=91785
```

> **Service account pe roles:** data store ke content ko search/ingest karne ke
> liye service account pe `roles/aiplatform.user` (ya `DiscoveryEngineEditor`)
> dena jaruri hai. IAM → apne service account → Add role → `aiplatform.user`.

---

## 4. Chalao

```bash
cd ai_backend
npm install @google-cloud/discoveryengine --ignore-scripts

npm run vertex:health          # config + kitna credit bacha
npm run vertex:ingest          # Firestore → data store (billable! credit kaatta hai)
npm run vertex:status          # credit ledger

# Test:
npm run vertex:search -- "SSC CGL syllabus"
npm run vertex:chat -- "Jobs kya available hain?"
npm run vertex:questions -- "Algebra" --exam "SSC CGL" --n 25   # grounded question set (mock_tests me save)
npm run vertex:from-source -- "Title" --text "<content>"        # apne PDF/text se question set
```

**PDF/Text se set banane ke 2 raste:**

1. **Admin → VERTEX AI tab → "PDF/Text → Question Set"** — PDF/image upload karo (text khud nikal jata hai, scanned PDF ka OCR bhi) ya text paste karo → **Generate Set** dabao. `mock_tests` me save hoga.
2. **CLI:** `npm run vertex:from-source -- "Title" --text "$(cat paper.txt)"`
   - PDF file se text: `npm run vertex:from-source -- "Title" --text "$(pdf-parse paper.pdf)"` (ya upload UI use karo).

---

## 4.5 Premium Section (Exam Sets) — Vertex grounding

**Admin → Premium tab → "Vertex AI (₹91,785)" provider chuno** (ya Gemini rakho — dono me, Vertex configured ho to har set generate karte waqt Vertex AI Search se source retrieve hota hai = **credit consume** + set grounded hota hai).

- Backend: `premium_notes.js` me `retrieveGroundedContext()` har premium set pe Vertex Search retrieval karta hai (credit) aur prompt ground karta hai. Set `aiProvider: "vertex-rag+gemini"`.
- Mock test system **bilkul untouched** — premium section ka alag flow hai.

## 5. Website me (frontend)

Backend routes already ready hain:
- `GET  /vertex/health`  → status + credit bacha
- `POST /vertex/search`  → grounded search
- `POST /vertex/chat`    → conversational assistant
- `POST /vertex/ingest`  → admin (token chahiye)
- `GET  /vertex/status`  → admin (credit ledger)

Frontend `src/components/StudyGyaanAIChat.tsx` floating "AI Sathi" widget inko
call karta hai. `App.tsx` me mount ho chuka hai.

---

## 6. Credit ko full use rakhne ka tip

- **Daily auto-ingestion**: jab bhi naya job/blog publish ho, usi waqt `ingest`
  call karo (document ingestion SKU credit consume karta hai aur corpus fresh
  rehta hai). Auto-indexer (`auto_indexer.js`) jaisa pattern follow karo.
- **Budget guard**: `VERTEX_CREDIT_BUDGET_INR=91785` default hai — budget khatam
  hote hi saare billing calls auto-stop (over-spend nahi hoga).
- **Asli billing**: estimated ₹ cost hum ledger me rakhte hain; pakka number
  hamesha Cloud Billing → Reports me dikhta hai. Ledger ko usse calibrate karo.

---

## ❌ Jab credit lagta NAHI (debug)

| Symptom | Fix |
|---|---|
| `VERTEX_NOT_CONFIGURED` | `VERTEX_PROJECT_ID`/`VERTEX_DATA_STORE_ID` set karo |
| Search returns empty | Pehle `--ingest` chalao (data store khali hai) |
| PermissionDenied | Service account ko `roles/aiplatform.user` do |
| Credit na kate | Pakka karo ki call **Vertex (discoveryengine)** pe hai, Gemini API pe nahi — `/vertex/health` se status dekho |
