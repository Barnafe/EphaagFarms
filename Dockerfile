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
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev -w backend
COPY backend backend
COPY --from=build /app/frontend/dist frontend/dist
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start", "-w", "backend"]
