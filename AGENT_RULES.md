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

## Quick checklist (har task)

- [ ] Branch: `arena/01a0409f-auto-video-backend` (sirf yahi)
- [ ] PR nahi, merge nahi (unless Rahul bole)
- [ ] Workflow change? → `WORKFLOW_COPY/*.yml.txt` only
- [ ] Push ke baad VS Code pull commands do
- [ ] Naya agent / naya session mat suggest karo
