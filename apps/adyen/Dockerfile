# apps/adyen/Dockerfile
# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
ARG PNPM_VERSION=10.28.1
ARG TURBO_VERSION=2.4.4
ARG PNPM_REGISTRY=https://registry.npmjs.org

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
# 钉死 turbo，避免每层 pnpm dlx 重新走网络
RUN npm i -g turbo@${TURBO_VERSION} --registry=${PNPM_REGISTRY}

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
ENV TURBO_TELEMETRY_DISABLED=1
ENV DO_NOT_TRACK=1

# ---------- 1. prune：只保留 adyen 及其依赖包 ----------
FROM base AS pruner
WORKDIR /app
# 注意：.dockerignore 不能排除 .git（turbo 需要仓库信息）
COPY . .
RUN turbo prune --scope=saleor-app-payment-adyen --docker

# ---------- 2. builder ----------
FROM base AS builder
ARG PNPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app

# 只影响构建：跳过 t3-env 校验 + 兜底 APL（默认值在 skip 时失效）
ENV SKIP_ENV_VALIDATION=1
ENV APL=file

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# store 落进 cache mount，重复构建不再全量下载
RUN echo "store-dir=/pnpm/store" >> .npmrc
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prefer-offline --registry=${PNPM_REGISTRY}

COPY --from=pruner /app/out/full/ .

# 根目录资源不在 prune 输出里，单独带进来
COPY --from=pruner /app/schema.graphql ./schema.graphql
COPY --from=pruner /app/saleor-json-schemas ./saleor-json-schemas

# 把指向 ../../../schema.graphql 的符号链接换成真实文件，否则容器里是死链
RUN rm -f apps/adyen/graphql/schema.graphql \
 && cp schema.graphql apps/adyen/graphql/schema.graphql

RUN --mount=type=cache,id=turbo-cache,target=/app/.turbo \
    pnpm --filter saleor-app-payment-adyen run generate

RUN --mount=type=cache,id=next-cache,target=/app/apps/adyen/.next/cache \
    pnpm --filter saleor-app-payment-adyen run build

# 断言产物存在，并清掉构建缓存，避免被 runner 拷走
RUN test -f apps/adyen/.next/BUILD_ID \
 && rm -rf apps/adyen/.next/cache .turbo apps/*/.next/cache

# ---------- 3. runner ----------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLED=1

# 只拷运行必需的三块；不要整仓 COPY，否则镜像会带上源码与 dev 依赖
COPY --from=builder /app/package.json   ./package.json
COPY --from=builder /app/node_modules   ./node_modules
COPY --from=builder /app/packages       ./packages
COPY --from=builder /app/apps/adyen     ./apps/adyen

WORKDIR /app/apps/adyen
EXPOSE 8080

# 直接 exec next，SIGTERM 能落到进程上，端口读 $PORT
CMD ["node_modules/.bin/next", "start"]
