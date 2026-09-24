# GSC Data Import — SEO Intelligence me Search Console data daalne ka tarika

## Ye kya hai?
`SEO Intelligence Runner` workflow (daily 7:15 AM) me Google Search Console ka
real data daal kar **CTR opportunities** on karte hain — matlab kaunse pages
impressions le rahe hain par clicks nahi (title/meta improve karne layak).

## Steps (5 minute, mahine me 1-2 baar kaafi hai)

### Step 1 — GSC se export
1. [search.google.com/search-console](https://search.google.com/search-console) kholo → **studygyaan.in** property
2. **Performance** → **Search results** click karo
3. Date range: **Last 3 months** select karo
4. Upar **Export** button → **Download CSV** (ya ZIP ho to extract karo)
   - `Pages.csv` = page-wise data (**sabse useful**)
   - `Queries.csv` = query-wise data (optional, extra insights)

### Step 2 — Convert karo (repo root se)
```powershell
node ai_backend/tools/gsc_export_to_json.js Downloads/Pages.csv
```
Output JSON screen pe aayega. File me save karne ke liye:
```powershell
node ai_backend/tools/gsc_export_to_json.js Downloads/Pages.csv Downloads/Queries.csv --out gsc.json
```

### Step 3 — Workflow me paste karo
1. GitHub → repo → **Actions** → **SEO Intelligence Runner**
2. **Run workflow** ▼ dropdown
3. `gsc_json` field me poora JSON paste karo (Step 2 ka output)
4. `dry_run` = `false`, `limit` = `80` (default) rehne do
5. **Run workflow** dabao

### Step 4 — Result dekho
Run hone ke baad Admin panel → **SEO Intelligence** tab me **CTR opportunities**
dikhne lagenge ("Low CTR: <page>" — kitne impressions, kitna CTR, avg position).

Agle din se daily run bhi wahi data use karega (Firestore me save ho jata hai).

## Notes
- JSON size limit ~64KB hai — tool by default **top 150 rows** (impressions ke
  hisaab se) deta hai, jo kaafi hai. Zyada chahiye to `--limit 300` tak.
- Ek baar import ke baad roz import karne ki zaroorat NAHI — data tab tak
  use hota hai jab tak naya import na ho.
- GSC API (automated) ke liye OAuth setup chahiye — wo alag project hai;
  ye manual path ZERO setup wala hai.
- Tool kuch bhi upload nahi karta — sirf tumhare PC pe CSV → JSON karta hai.
