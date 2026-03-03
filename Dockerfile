FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production

# Install Playwright Chromium + all its system dependencies
RUN bunx playwright install --with-deps chromium

COPY src/ src/
COPY tsconfig.json ./

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
