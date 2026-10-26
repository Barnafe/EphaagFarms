# v32 deployment setup (base: v31)
- `DEPLOYMENT.md` rewritten: accounts, Neon, GitHub, Render Blueprint, R2, SES (including bounce topic), SMS, Paystack, the keep-alive pinger, first admin, go-live checklist, troubleshooting.
- `npm run preflight` (project root or `backend/`): PASS/WARN/FAIL for database, JWT secret, site address, R2, email, SMS, Paystack key (test vs live), simulated payments, rate-limit multiplier, tick secret, CSP mode; also tests the database connection. In production the same checklist is logged at boot; only a missing or short `JWT_SECRET` stops the server.
- `render.yaml` lists every variable (secrets marked `sync: false`), Node 22, health check `/health`, generated `JWT_SECRET` and `JOB_TICK_SECRET`.
- `Dockerfile` + `.dockerignore` for any container host. **Not built here** (no Docker in the build environment): build it once and check `/health`.
- `engines.node >= 20`.
- Dry run done here: production-mode boot with a complete configuration -> preflight 0 must-fix, `/health` green, frontend served, `/api/system/tick` refuses a missing secret and runs jobs with the right one.
- Things only you can do: create the accounts, set the variables, point the Paystack webhook, SES production access and SMS sender-name approval, a domain, an always-on plan.
