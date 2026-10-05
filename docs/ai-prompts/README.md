# Team AI prompts

Each feature has one prompt. Paste it as the **first message** of a new AI chat before you ask anything about your feature. This gives everyone's AI the same project context, conventions and contracts, so our code fits together. It also keeps the AI inside the IS216 AI rules.

| File | Who | Use for |
|---|---|---|
| [`f1a-registration.md`](f1a-registration.md) | Kuah | Registration, login, router, OneMap, school seed |
| [`f1b-allocation.md`](f1b-allocation.md) | Fanny | Allocation algorithm, board, map, publish, accept/decline |
| [`f2-replacement.md`](f2-replacement.md) | Yap | Drop-out, open slot cards, radius map, approve, swaps, history |
| [`f3-tracking.md`](f3-tracking.md) | Chin | Check-ins, pings, wake lock, HQ live map, simulation |
| [`f4-incidents.md`](f4-incidents.md) | Wei Ming | Incident reports, triage queue, alerts, Socket.IO bonus |
| [`f5-badges.md`](f5-badges.md) | Hanafi | Badges, Badge Studio, orders, deployment |
| [`00-shared-context.md`](00-shared-context.md) | Anyone | Cross-feature work: integration, styling pass, README, slides |

## Rules for the team

1. **Always start with your prompt.** Don't ask the AI about the project without it.
2. **The AI won't write your core logic.** That's on purpose: the briefing (slide 31) bans AI for business logic, backend endpoints and key interactivity. It will explain, give steps, review your code, and write boilerplate, layouts, tests and mock data.
3. **Log AI use.** When the AI generates code, it ends with a line `README.txt AI log: ...`. Copy that line into the AI section of `README.txt`.
4. **Keep the prompts in sync.** The PROJECT CONTEXT and COURSE AI RULES sections are identical in all 7 files. If you change a contract (an endpoint, a field name, a testid), update `docs/API.md` and the affected prompt(s) in the same PR.
