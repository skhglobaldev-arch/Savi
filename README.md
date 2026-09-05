# AI Workspace MVP

Premium mock foundation for an AI utility workspace.

## Run locally

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Important

This version intentionally uses mocked AI responses and mocked credits only.
No real API keys are included.

API keys should later be added only in `.env.local`, never directly inside components or prompts.

## Pages

- `/` landing page
- `/workspace` Ask Anything workspace
- `/credits` mock plans/credits
- `/settings` future integrations

## Future integrations

- Firebase Auth
- Firestore usage logs
- Firebase Storage uploads
- Gemini API server routes
- iLovePDF server wrapper
- Stripe checkout and webhooks

## Fix note
This package marks the landing page as a Client Component because it renders interactive template cards. If you see older errors, delete `node_modules` and `package-lock.json`, then run `npm install` again.
