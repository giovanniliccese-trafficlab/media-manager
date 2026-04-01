FROM node:24-alpine

# Install all dependencies in one layer
RUN apk add --no-cache \
    ffmpeg \
    ffmpeg-libs \
    curl \
    ca-certificates \
    bash \
    docker-cli \
    net-tools \
    && npm config set registry https://registry.npmjs.org/

WORKDIR /app

# Copy and install dependencies first (better caching)
COPY package*.json ./
RUN npm install --production --no-optional --no-audit

# Copy application files
COPY . .

# Setup in one command
RUN mkdir -p data/backup data/mediamtx logs && \
    chmod +x docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "backend/server.js"]