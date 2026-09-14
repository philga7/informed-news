# Archived: MVP React feed (NEWS-46)

Personal CFP React UI formerly at `mvp/web`. **Not** the product UI — that is `apps/kite`.

Kept under `_legacy/` for one release cycle of recoverability. Do not wire into default `npm run dev`.

Optional local revive (not recommended):

```bash
npm ci --prefix _legacy/mvp-web
npm run server   # from repo root
npm run dev --prefix _legacy/mvp-web   # :5174
```

Vercel still builds this static artifact until a hosting cutover (see root `vercel.json`).
