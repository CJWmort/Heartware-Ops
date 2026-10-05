# How we work together (Git + GitHub)

This guide is written for people who are new to Git. Follow it step by step.

## The golden rules

1. **`main` must always work.** Nobody pushes directly to `main`.
2. **One branch per task.** Small branches merge with fewer conflicts.
3. **Pull before you start** every work session.
4. **Every Pull Request (PR) needs one approval** from a teammate before merging.
5. **Never commit `config.env` or `.env`.** They contain passwords. They are already in `.gitignore`.

## Branch names

```
feature/<feature-number>-<short-name>   e.g. feature/2-claim-slot-card
fix/<short-name>                        e.g. fix/navbar-mobile-overflow
test/<short-name>                       e.g. test/e2e-incident-report
docs/<short-name>                       e.g. docs/readme-setup
```

## Your daily routine

```bash
# 1. Get the latest main
git checkout main
git pull

# 2. Make (or switch to) your branch
git checkout -b feature/4-incident-queue     # new branch
# or: git checkout feature/4-incident-queue  # existing branch
#     git merge main                         # bring in teammates' latest work

# 3. Work... then save a checkpoint
git add .
git commit -m "feat(incidents): add triage status buttons"

# 4. Upload your branch
git push -u origin feature/4-incident-queue
```

Then go to GitHub, click **Compare & pull request**, fill in the template, and request a review.

## Commit message format

```
<type>(<area>): <what you did>
```

| type | use for |
|---|---|
| `feat` | a new feature or screen |
| `fix` | a bug fix |
| `style` | CSS / layout only |
| `test` | adding or fixing tests |
| `docs` | README or docs |
| `chore` | config, packages, tidying |

Examples: `feat(allocation): drag volunteer between schools`, `test(badges): e2e for badge studio`.

## Merge conflicts

If GitHub says your branch has conflicts:

```bash
git checkout main && git pull
git checkout <your-branch>
git merge main
# VS Code highlights the conflicting files → choose "Accept Current", "Accept Incoming" or "Accept Both"
git add .
git commit -m "chore: resolve merge conflicts with main"
git push
```

If you're stuck, ask in the group chat **before** you force anything. Never run `git push --force` on `main`.

## Using GitHub Issues and Projects

- Every task in `docs/TIMELINE.md` should become an **Issue** (use the "Feature task" template).
- Assign yourself, add the label for your feature (`feature-1a`, `feature-1b`, `feature-2` … `feature-5`).
- Put the Issue on the team **Project board** (To do → In progress → In review → Done).
- In your PR description write `Closes #<issue-number>` so the issue closes automatically when merged.

## AI usage (course rule)

The IS216 briefing allows AI for boilerplate, layouts, debugging hints, test cases and mock data,
but **not** for core logic, backend endpoints or key interactivity. Start every AI chat with your
feature's prompt from `docs/ai-prompts/`. If you use AI for anything,
add a line to the "AI usage" section of `README.txt` describing what and where.
