# ==================== Frontend Build Stage ====================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy frontend package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY . .

# Build frontend (outputs to /app/dist)
RUN npm run build

# ==================== Backend Build Stage ====================
FROM node:20-alpine AS backend-builder

WORKDIR /app/server

# Copy backend package files
COPY server/package*.json ./

# Install dependencies
RUN npm ci

# Copy backend source
COPY server/ .

# Build backend (outputs to /app/server/dist)
RUN npm run build

# ==================== Production Stage ====================
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies for backend
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy built backend
COPY --from=backend-builder /app/server/dist ./server/dist

# Copy built frontend
COPY --from=frontend-builder /app/dist ./frontend/dist

# Copy database init script
COPY server/db ./server/db

# Expose port
EXPOSE 3001

# Default command (can be overridden)
CMD ["node", "server/dist/index.js"]

