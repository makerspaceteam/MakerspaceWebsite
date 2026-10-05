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
RUN npm ci --omit=dev
COPY backend/src ./src
COPY --from=frontend-build /frontend/dist ./public

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/server.js"]
