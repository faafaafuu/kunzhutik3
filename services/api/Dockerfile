# Stage 1: the client app (apps/client) exported for the web — the site and the Telegram WebApp.
FROM node:22-slim AS client
WORKDIR /client
COPY apps/client/package.json apps/client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/client ./
# Empty API URL: the site calls the API on its own origin.
ENV EXPO_PUBLIC_API_URL=""
RUN npx expo export -p web --output-dir dist

# Stage 2: the API, which also serves the built site.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY services/api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY services/api /app/services/api
COPY --from=client /client/dist /app/client-dist
ENV PYTHONPATH=/app/services/api
ENV CLIENT_DIST_DIR=/app/client-dist

WORKDIR /app/services/api

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
