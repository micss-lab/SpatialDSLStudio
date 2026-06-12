FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update -y \
	&& apt-get install -y --no-install-recommends openssl \
	&& rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci

WORKDIR /app
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src
COPY backend/prisma ./backend/prisma
COPY shared ./shared

WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

EXPOSE 3001

CMD ["sh", "-c", "npm run prisma:migrate:prod && if [ \"$SEED_DATABASE\" = \"true\" ]; then npm run prisma:seed; fi && npm start"]
