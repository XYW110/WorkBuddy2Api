# syntax=docker/dockerfile:1

# ==========================================
# Stage 1: 前端构建
# ==========================================
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_BASE=
RUN npm run build

# ==========================================
# Stage 2: 后端构建 + 生产依赖裁剪
# ==========================================
FROM node:20-alpine AS backend-build
WORKDIR /backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/ ./
RUN npm run build
# 仅保留生产依赖
RUN npm prune --omit=dev

# ==========================================
# Stage 3: 运行时（精简镜像）
# ==========================================
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=11434 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/public

# 生产依赖 + 编译产物
COPY --from=backend-build /backend/package.json ./
COPY --from=backend-build /backend/node_modules ./node_modules
COPY --from=backend-build /backend/dist ./dist
COPY --from=backend-build /backend/config.json ./config.json

# 前端静态资源
COPY --from=frontend-build /frontend/dist ./public

# 数据目录（运行时 volume 会覆盖）
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 11434

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:11434/health || exit 1

CMD ["node", "dist/index.js"]
