# Response Engine Dockerfile

FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY services/response-engine/package*.json ./
COPY services/response-engine/tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY services/response-engine/src ./src

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-slim

WORKDIR /app

# Copy package files and install production dependencies
COPY services/response-engine/package*.json ./
RUN npm ci --only=production

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Run the service
CMD ["node", "dist/index.js"]
