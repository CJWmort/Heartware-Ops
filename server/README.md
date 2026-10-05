# Server (Express + MongoDB)

```bash
npm install
cp config.env.example config.env   # then fill in DB + JWT_SECRET
npm run dev                         # http://localhost:8000/api/health
npm test                            # API smoke tests
```

How a request flows:  `routes/x-routes.js` → `middleware/auth.js` (login + role check) → `controllers/x-controller.js` → `models/`.

Every controller function that still returns **501** is a TODO for its owner. The contract (what each
endpoint receives and returns) is in `../docs/API.md`.

Demo accounts after `npm run seed:demo`: `coordinator@demo.sg`, `hq@demo.sg`, `volunteer1@demo.sg` …, password `Password123!`.
