# Build context is the repo root (needs both frontend/ and backend/).

FROM node:22-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Same-origin: Express serves both API and static files, so the browser
# never needs an absolute API URL.
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/src ./src
COPY --from=frontend-build /frontend/dist ./public

ENV NODE_ENV=production
EXPOSE 4000
# Run as the unprivileged "node" user (uid 1000) from the base image, not
# root: a bug in the app can then not modify the image's files or the host.
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "src/server.js"]
