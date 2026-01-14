# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev, ignore scripts for git hooks)
RUN npm ci --ignore-scripts

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S corvid -u 1001 -G nodejs

# Copy package files
COPY package*.json ./

# Install production dependencies only (ignore-scripts to skip git hooks setup)
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Set ownership to non-root user
RUN chown -R corvid:nodejs /app

# Switch to non-root user
USER corvid

# Expose port (default 3000, can be overridden)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
