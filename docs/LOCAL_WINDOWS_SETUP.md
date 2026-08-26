#  Windows Local Setup Guide — StudyGyaan

## Pehli Baar Setup (First Time)

### Step 1: Git Clone
```powershell
cd C:\Users\Rahul
git clone https://github.com/rahul74603/auto-video-backend.git
cd auto-video-backend
```

### Step 2: Branch Switch
```powershell
git checkout arena/01a02390-auto-video-backend
```

### Step 3: Dependencies Install
```powershell
npm install --legacy-peer-deps
```

### Step 4: Environment Setup
```powershell
# .env.local file banao (git ignore hai)
notepad .env.local
```

Ye content paste karo:
```
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=studymaterial-406ad
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_ADMIN_EMAIL=your_admin_email
VITE_UPI_ID=your_upi_id
```

### Step 5: Test Run
```powershell
# Backend tests
cd ai_backend
npm test

# Frontend tests
cd ..
npx vitest run

# Build check
npm run build
```

### Step 6: Dev Server
```powershell
npm run dev
```

Browser me jao: http://localhost:5173

---

## Roz Ka Kaam (Daily Workflow)

### Jab Naya Code Aaye:
```powershell
cd C:\Users\Rahul\auto-video-backend
git fetch origin
git checkout arena/01a02390-auto-video-backend
git pull origin arena/01a02390-auto-video-backend
npm install --legacy-peer-deps
npm run dev
```

### Jab Main Branch Pe Jaana Ho:
```powershell
git checkout main
git pull origin main
npm run dev
```

### Jab Production Deploy Karna Ho:
```powershell
git checkout arena/01a02390-auto-video-backend
git pull origin arena/01a02390-auto-video-backend
npm run build
```

Fir `dist/` folder ready hai (normal Vite build output).

---

## Common Commands

### Status Check
```powershell
git status
```

### Changes Dekhna
```powershell
git diff
```

### Stash Changes (Temporary Save)
```powershell
git stash
```

### Stash Wapas Lana
```powershell
git stash pop
```

### Branch List
```powershell
git branch -a
```

### Last 10 Commits
```powershell
git log --oneline -10
```

---

## Troubleshooting

### Problem: `npm install` fail ho raha hai
**Solution:**
```powershell
npm cache clean --force
npm install --legacy-peer-deps
```

### Problem: Port already in use
**Solution:**
```powershell
# Port 5173 band karo
netstat -ano | findstr :5173
taskkill /PID <PID> /F
npm run dev
```

### Problem: Build fail ho raha hai
**Solution:**
```powershell
rm -rf node_modules
rm package-lock.json
npm install --legacy-peer-deps
npm run build
```

### Problem: Git merge conflicts
**Solution:**
```powershell
git checkout --theirs .
git add .
git commit -m "fix: merge conflicts"
```

---

## Folder Structure

```
C:\Users\Rahul\auto-video-backend\
├── ai_backend/          # Backend code (Node.js)
│   ├── agents/          # AI agents
│   ├── growth/          # Growth engine
│   ── tests/           # Backend tests
├── src/                 # Frontend code (React)
├── public/              # Static files
├── docs/                # Documentation
└── package.json         # Dependencies
```

---

## Performance Tips

1. **VS Code Extensions:**
   - ESLint
   - Prettier
   - GitLens

2. **Terminal:**
   - PowerShell 7+ use karo (faster)
   - Windows Terminal install karo

3. **Node Version:**
   - Node 20 LTS use karo
   - `nvm` se manage karo

4. **Git:**
   - Git 2.40+ use karo
   - `git config --global core.autocrlf true`

---

## Quick Reference

| Task | Command |
|------|---------|
| Clone repo | `git clone <url>` |
| Switch branch | `git checkout <branch>` |
| Pull latest | `git pull origin <branch>` |
| Install deps | `npm install --legacy-peer-deps` |
| Run tests | `npm test` |
| Build | `npm run build` |
| Dev server | `npm run dev` |
| Check status | `git status` |
| View logs | `git log --oneline -10` |

---

**Last Updated:** 2026-08-24  
**Branch:** `arena/01a02390-auto-video-backend`
