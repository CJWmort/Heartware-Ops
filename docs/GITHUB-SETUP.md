# One-time GitHub setup (team lead)

Do this once, then share the repo link with the team.

## 1. Create the repo and push the starter

1. On GitHub: **New repository** → name `heartware` → **Private** → do **not** add a README, .gitignore or licence (we already have them) → **Create**.
2. On your computer, open a terminal **inside the `heartware` folder**:

```bash
git init
git add .
git commit -m "chore: project starter scaffold"
git branch -M main
git remote add origin https://github.com/<your-username>/heartware.git
git push -u origin main
```

3. Check on GitHub that you can see `client/`, `server/`, `docs/` and **no** `config.env` or `.env` files.

## 2. Add teammates

**Settings → Collaborators → Add people.** Add all 5 teammates (and the instructor if required).
Then open `.github/CODEOWNERS` and replace each `@xxx-github` placeholder with the real usernames.

## 3. Protect `main`

**Settings → Branches → Add branch ruleset** (or "Add rule") for `main`:

- ✅ Require a pull request before merging, with **1 required approval**
- ✅ Require status checks to pass, and pick the **CI** jobs (`client`, `server`) after the first CI run
- ✅ Block force pushes

## 4. Labels

**Issues → Labels → New label:** `feature-1a`, `feature-1b`, `feature-2`, `feature-3`, `feature-4`, `feature-5`, `bug`, `styling`, `testing`.

## 5. Project board

**Projects → New project → Board.** Columns: *To do · In progress · In review · Done*.
Create one Issue per bullet in `docs/TIMELINE.md` (use the "Feature task" template), assign the owner, add the label, and add it to the board.

## 6. Shared secrets

Create the MongoDB Atlas cluster, then send the `DB=` connection string and a `JWT_SECRET` to the team **privately** (not in GitHub). Everyone pastes them into their own `server/config.env`.

## 7. First practice PR (everyone)

Each member clones the repo, runs it (see the main README), then opens a small PR. For example, put their name in the "To build" box of their own page. This makes sure everyone can branch, push and get a review before real work starts.
