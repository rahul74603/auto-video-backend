# StudyGyaan frontend + automation backend

React/TypeScript/Vite frontend with Firebase Functions automation in `ai_backend/`.

## Local checks

```bash
# Frontend
npm ci --legacy-peer-deps
npm test -- --run
npx tsc -b

# Firebase Functions / agents
cd ai_backend
npm ci --ignore-scripts   # useful on machines without native canvas build tools
npm test
npm run check
```

## AI Article Studio

**Source-grounded Job & Fast Track writers · Fact & Quality review · Draft-first · Author: StudyGyaan Editorial Team**

The article endpoints are backend-protected. Before deploying the `api` function, configure at least one of these admin mechanisms:

- `ARTICLE_ADMIN_EMAILS`: comma-separated Firebase Auth emails allowed to use `/articles/*`; or
- Firebase custom claim `admin: true`; or
- `AGENT_ADMIN_TOKEN` for trusted server-to-server calls.

The browser automatically sends the signed-in Firebase user's ID token. Do not put `AGENT_ADMIN_TOKEN` in frontend/Vite variables.

Optional adaptive generation settings:

```dotenv
AI_ARTICLE_STRATEGIES=3
AI_ARTICLE_BUDGET_MS=225000
```

Generation and regeneration use a bounded adaptive strategy: the first passed Fact & Quality review stops immediately; conservative alternatives run only for fixable failures. Publishing remains a separate server-authoritative action and is blocked unless the latest review verdict is `pass` and the author is exactly `StudyGyaan Editorial Team`.

See `.env.example` and `ai_backend/.env.example` for the remaining Firebase, Gemini, Telegram, and indexing configuration.
