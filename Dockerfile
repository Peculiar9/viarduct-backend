FROM node:18-alpine

WORKDIR /app

# Install pnpm (package.json pnpm.onlyBuiltDependencies allows required build scripts)
RUN npm install -g pnpm

# Skip husky git hooks in container builds
ENV HUSKY=0

# Copy dependency files first (better caching)
COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Expose Fly runtime port
EXPOSE 3000

# Start app
CMD ["pnpm", "start"]
