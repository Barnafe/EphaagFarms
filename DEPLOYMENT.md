# Deploying EPHAAG Farms (Render free tier + Neon)

This is the *temporary, keep-updating-as-we-go* setup — one Render web
service serves both the API and the built frontend, and a free Neon
Postgres database sits behind it. When you're ready for the real
deployment (paid tier, custom domain, persistent file storage), most of
this still applies — you'd mainly upgrade the Render plan and add
external storage for uploads (see the warning below).

## 1. Create the database (Neon)

1. Go to neon.tech, sign up, create a new project.
2. On the project dashboard, open **Connection Details** and copy the
   **pooled connection** string. It looks like:
   `postgresql://user:password@ep-xxxx-pooler.region.aws.neon.tech/dbname?sslmode=require`
3. Keep that string handy for step 3 below — you'll paste it into Render
   as `DATABASE_URL`. You do **not** need to run any SQL yourself; the
   app creates its own tables automatically on first boot (see step 4).

## 2. Push this project to GitHub

Render deploys from a git repo. If you haven't already:

```bash
cd Ephaag-farms
git init
git add .
git commit -m "Initial deploy"
```

Create an empty repo on GitHub, then push:

```bash
git remote add origin https://github.com/<you>/ephaag-farms.git
git branch -M main
git push -u origin main
```

(`.gitignore` is already set up so `node_modules/`, build output, `.env`,
and uploaded files never get committed.)

## 3. Deploy to Render

**Easiest path — Blueprint:** this repo includes `render.yaml`. On
Render, choose **New → Blueprint**, point it at your GitHub repo, and
Render reads `render.yaml` and sets up the service and env var slots for
you. You'll be prompted to fill in the blank ones:

- `DATABASE_URL` — the Neon pooled connection string from step 1
- `ADMIN_SETUP_CODE` — make up a private string (needed to register an
  Admin account through the public Register page)
- `FRONTEND_ORIGIN` — leave blank for the first deploy; **after** the
  first deploy Render gives you a URL like
  `https://ephaag-farms.onrender.com` — paste that back in here and
  redeploy (this is only used for the password-reset email link)
- `JWT_SECRET` — Render generates this for you automatically
- SMTP settings — optional; leave blank for now and emails will just be
  logged to the server console instead of sent, which is fine while
  you're the only one testing

**Manual path**, if you'd rather not use the blueprint: New → Web
Service → connect the repo →
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Health check path: `/health`
- Add the same env vars listed above by hand.

Either way, pick the **Free** instance type.

## 4. First boot

The start command runs the database migration automatically before
starting the server (`node src/db/migrate.js && node src/server.js`),
and it's safe to run on every single deploy — it only creates
tables/columns that don't already exist, so it won't touch or wipe your
data on redeploys. You don't need to run migrations by hand.

After the first successful deploy, create your admin account and seed
starting prices by running these **once**, from your own machine,
pointed at the Neon database (set `DATABASE_URL` and `DB_SSL=true` in
your local `.env` temporarily, or export them inline):

```bash
cd backend
DATABASE_URL="<your neon connection string>" DB_SSL=true npm run seed:admin -- --email you@example.com --password "SomeStrongPassword" --name "Your Name"
DATABASE_URL="<your neon connection string>" DB_SSL=true npm run seed:prices
```

(Or just use the public Register page with your `ADMIN_SETUP_CODE` —
whichever's easier.)

## Known limitation while on the free tier

**Uploaded files (profile photos, investment agreement PDFs, farmer
declaration sheets, request attachments) are stored on local disk and
are NOT persistent on Render's free tier.** Every redeploy — and every
time the free-tier service spins down from inactivity and back up — the
filesystem resets to whatever's in the git repo, which means anything
uploaded gets wiped. This is fine for now while you're previewing and
testing functionality live, but before this goes to real users you'll
want to move uploads to something persistent (e.g. an S3-compatible
bucket, or a Render paid plan with a persistent disk). Flagging this
now so it isn't a surprise later — nothing to do about it yet, just
don't rely on uploaded files surviving a redeploy in this setup.

**Free tier also sleeps after inactivity** — the first request after a
period of no traffic can take 30–60 seconds while it spins back up.
Normal for free tier, not a bug.

## What changed in the code to make this possible

- The backend now serves the built frontend directly (same origin, one
  service) with a fallback so client-side routes work on refresh.
- Postgres SSL is configurable via `DB_SSL` (Neon requires it; a local
  Postgres for dev doesn't).
- Every hardcoded `localhost:4000` reference in the frontend was
  replaced with a relative `/api` path that works automatically once
  built for production.
