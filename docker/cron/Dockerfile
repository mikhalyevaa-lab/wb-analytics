FROM node:22-alpine
WORKDIR /app

# Устанавливаем все зависимости (включая devDeps для tsx)
COPY package.json package-lock.json ./
RUN npm ci

# Копируем исходники нужные для крона
COPY tsconfig.json ./
COPY src ./src
COPY cron ./cron

CMD ["npx", "tsx", "cron/runner.ts"]
