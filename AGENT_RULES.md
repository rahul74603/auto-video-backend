# AGENT_RULES — Rahul + Agent long-term working contract

> Ye file **hamesha yaad rakhni hai**. Naya rule bole to isi file me ADD karo.
> Session branch: `arena/01a0409f-auto-video-backend`
> Date started: 2026-08-27

Sirf **Rahul** aur **yehi agent/session** long-term kaam karenge.
Naya agent mat banao. "Push nahi kar sakta, naya agent banao" mat bolo.

---

## Rule 1 — PR / merge mat karo (default)

- Kaam isi session branch pe karo: `arena/01a0409f-auto-video-backend`
- Commit + `git push origin arena/01a0409f-auto-video-backend`
- **Pull Request mat kholo** jab tak Rahul explicitly na bole
- **Merge mat karo / merge karne ko mat bolo** jab tak Rahul explicitly na bole
- `main` pe switch / push mat karo
- Dusri branch mat banao, mat switch karo
- Bar-bar PR → merge → session toot — ye cycle **band** hai

Is session ka source of truth ye branch hai, `main` nahi.

---

## Rule 2 — GitHub workflow files (.yml) directly mat push karo

GitHub App ko `.github/workflows/*` push karne ki permission nahi hai.

Jab bhi workflow badalna / naya banana ho:

1. File banao / update karo: `WORKFLOW_COPY/<name>.yml.txt`
2. **Complete** file likho (poori YAML). Snippet, `...`, placeholder mat chhodo
3. `.github/workflows/` me agent khud change **mat push kare**
4. Rahul ko clearly bolo: **ACTIVE WORKFLOW REQUIRES MANUAL COPY**
5. Rahul manually copy-paste karega:
   - `WORKFLOW_COPY/<name>.yml.txt` → `.github/workflows/<name>.yml`

Active workflow folder sirf ek hai: `.github/workflows/`
`WORKFLOW_COPY/` GitHub Actions run **nahi** karta. Backup / paste-source hai.

---

## Rule 3 — Har code update ke baad VS Code / PC pull commands do

Rahul VS Code use karta hai (Windows). Har push ke baad **ready-to-run** commands do:

```powershell
cd C:\Users\Rahul\auto-video-backend
git fetch origin
git checkout arena/01a0409f-auto-video-backend
git pull origin arena/01a0409f-auto-video-backend
```

Agar `npm` deps change hue hon to extra:

```powershell
npm install --legacy-peer-deps
```

Commands short, copy-paste ready, har relevant turn ke end me.

---

## Rule 4 — Future rules

Rahul jab naya rule bole:

1. Isi file (`AGENT_RULES.md`) me numbered rule ADD karo
2. Purane rules delete mat karo unless Rahul explicitly replace kare
3. Commit + isi branch pe push
4. Confirm karo: "Rule add ho gaya"

---

## Rule 5 — SEO optimizer proposals never apply themselves

Phase 3 `seo_intelligence` optimizer may only create reviewable proposals on
`system_settings/seo_intelligence.optimizationProposals`.

- Public content collections (jobs / blogs / fast_track / mock_tests / materials / courses / ebooks / web_stories) par optimizer write **mat** kare
- Approve/Reject **sirf status** badle (`pending` → `approved` | `rejected`). `applied: true` mat set karo
- Apply / rollback / auto-fix / auto-publish Phase 4 se pehle **mat** implement karo
- Fact fields (salary, vacancies, dates, applyLink, questions, …) lock hain — invented replacement mat do
- `firestore.rules` mat badlo. Nayi public-read collection (`seo_optimization_proposals`) mat banao
- Live production content is turn me modify **mat** karo

---

## Rule 6 — SEO apply only after approval + snapshot + fact lock

Apply engine (`apply_engine.js`) public content tabhi likhe jab:

1. Proposal `approved` ho (Approve khud public write nahi karta)
2. Actor set ho
3. Field allowlisted ho (seoTitle/meta/h1/author/imageAlt/faqs/relatedLinks/omit JobPosting)
4. Fact fields lock rahein
5. Level C kabhi apply na ho
6. Snapshot `seo_apply_snapshots` me save ho **pehle**
7. Batch max 5, Level B mass-apply nahi
8. IndexNow/sitemap ping request hai, ranking claim nahi
9. Auto-apply / auto-publish / auto-create pages OFF

`firestore.rules` me `seo_apply_snapshots` aur `seo_apply_queue` admin-only hain.
Optimizer ab bhi khud apply nahi karta.

---

## Quick checklist (har task)

- [ ] Branch: `arena/01a0409f-auto-video-backend` (sirf yahi)
- [ ] PR nahi, merge nahi (unless Rahul bole)
- [ ] Workflow change? → `WORKFLOW_COPY/*.yml.txt` only
- [ ] Push ke baad VS Code pull commands do
- [ ] Naya agent / naya session mat suggest karo
