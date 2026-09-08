# StudyGyaan FREE SEO System (No Firebase Billing!)

Firebase Functions ki jagah GitHub Actions roz ye kaam karta hai:

1. **Firestore se data padh ke** saare sitemaps + RSS + recent-urls.txt generate karta hai
2. **cPanel pe FTP se upload** karta hai (studygyaan.in root me)
3. **IndexNow pe naye URLs submit** karta hai (Bing, Yandex, Seznam)

Bill: **₹0 hamesha.** Na card chahiye, na Blaze plan.

## Files

| File | Kaam |
|---|---|
| `generate.cjs` | Firestore → sitemap-*.xml, sitemap.xml, sitemap-all.xml, rss.xml, feed.xml, recent-urls.txt |
| `indexnow.cjs` | `daily` mode = last 3 din ke URLs submit; `bulk` mode = saare URLs (max 10k) |
| `workflow-seo-daily.yml.txt` | GitHub Actions workflow — iska content `.github/workflows/seo-daily.yml` me paste karna hai |

## Setup (ek baar)

### 1. Firebase service account key banao (FREE — Spark plan pe bhi chalta hai)
- Firebase Console → Project Settings (⚙️) → **Service accounts** tab
- **Generate new private key** → JSON file download hogi

### 2. GitHub Secrets set karo
Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Downloaded JSON file ka **poora content** paste karo |
| `FTP_SERVER` | cPanel FTP host (e.g. `ftp.studygyaan.in` ya server IP) |
| `FTP_USERNAME` | cPanel FTP username |
| `FTP_PASSWORD` | cPanel FTP password |
| `FTP_SERVER_DIR` | `/public_html/` (trailing slash zaroori) |

### 3. Workflow file banao
- GitHub → repo → **Add file → Create new file**
- Naam: `.github/workflows/seo-daily.yml`
- `workflow-seo-daily.yml.txt` ka content paste karo (pehli 2 comment lines chhod ke)
- Commit directly to main

### 4. Pehli baar BULK chalao
- Actions → "Daily SEO - Sitemaps + IndexNow (FREE)" → Run workflow → mode me `bulk` likho → Run
- Iske baad roz subah 6 baje IST automatic chalega (`daily` mode)

## Local test (bina Firestore ke)

```
cd seo_static
node generate.cjs --mock --out ../seo_out
```

## Note
- Google IndexNow support nahi karta — Google ke liye Search Console me
  `https://studygyaan.in/sitemap.xml` submit hona kaafi hai (sitemaps me lastmod
  roz fresh hota rahega).
- Firestore free quota: 50,000 reads/day — ye script roz ~10-20k reads use
  karta hai max, bilkul safe.
