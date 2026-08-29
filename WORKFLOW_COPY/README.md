# WORKFLOW_COPY — Manual paste source (Owner only)

GitHub Actions **is folder ko run nahi karta**. Ye sirf Rahul ke liye ready-to-paste `.txt` copies hain.

Active workflows sirf yahan chalte hain:

```
.github/workflows/     ← ACTIVE (sirf ye run hota hai)
WORKFLOW_COPY/         ← paste-source (kabhi run nahi hota)
```

## Kyun ye folder hai

Agent / GitHub App `.github/workflows/*` push nahi kar sakta (permission nahi).
Isliye workflow change **yahan** `.yml.txt` me aati hai. Rahul manually copy-paste karta hai.

## Rahul — kaise apply kare

1. `WORKFLOW_COPY/<name>.yml.txt` kholo
2. Ctrl+A → Copy
3. GitHub pe `.github/workflows/<name>.yml` kholo (ya VS Code me, **main** pe owner account se)
4. Purani file replace karo
5. Commit

Jab tak ye manual copy na ho, agent report karega:
**ACTIVE WORKFLOW REQUIRES MANUAL COPY**

## Files

| File | Purpose |
|------|---------|
| `seo_intelligence.yml.txt` | SEO intelligence workflow paste-source |
| `gsc_search_analytics_ingest.yml.txt` | GSC Search Analytics daily ingest paste-source (Phase 1 — data collection only, never optimizes) |

Nayi workflow = naya `<name>.yml.txt` yahi folder me. Complete YAML, koi snippet nahi.

## Permanent rules

1. Doosri active workflow folder mat banao
2. Agent workflow ko "pushed" mat pretend kare
3. Hamesha complete `.yml.txt` rakho
4. Details: `AGENT_RULES.md` Rule 2
