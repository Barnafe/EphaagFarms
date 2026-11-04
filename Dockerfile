# For any host that runs containers (Fly.io, Railway, a VPS...). Render does not need this file.
# NOT built or run in the environment where this project was prepared: build it once with
#   docker build -t ephaag-farms .   and   docker run --env-file .env -p 4000:4000 ephaag-farms
# and check http://localhost:4000/health before relying on it.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# The nightly backup runs pg_dump, and a restore drill runs pg_restore. The client must be the same major version as
# the database server or newer (Neon runs 16 or 17: check the version in its console and change this if needed).
ARG PG_CLIENT_VERSION=17
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-${PG_CLIENT_VERSION} \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev -w backend
COPY backend backend
COPY --from=build /app/frontend/dist frontend/dist
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start", "-w", "backend"]
