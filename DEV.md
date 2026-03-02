# 开发与部署指南 (Development & Deployment Guide)

本项目是一个全栈应用，前端采用 **Next.js**，后端为 **Cloudflare Worker**。
为了实现同一域名下无缝部署、避免跨域问题并简化架构，我们将 Frontend (Next.js) 的静态构建产物配置为了 Cloudflare Worker 的**静态资产边界（Static Assets Binding）**，由 Worker 在统一入口内负责页面渲染与 API 接口的响应。

---

## 💻 1. 本地开发调试方案

你可以根据所处的开发阶段选择以下两种开发模式：

### 模式一：前后端独立热更新（推荐）
这是最常用的开发工作流。前端页面修改能享受秒级热刷新，后端接口修改也立刻生效。
在这种模式下，你需要同时运行前后端服务。目前我们在前端代码的主入口中做了自适应，当在本地开发环境中发起 API 请求时会自动指向 Worker 的本地调试地址 (`http://localhost:8787`)。

你需要**打开两个独立的终端窗口**：

**1. 启动后端 Worker (运行于 8787 端口)**
```bash
# 在项目根目录下执行：
npm run dev
```

**2. 启动前端 Next.js (运行于 3000 端口)**
```bash
# 进入 frontend 目录
cd frontend

# 安装依赖并启动前端服务
npm install
npm run dev
```

服务均正常启动后，打开浏览器访问 `http://localhost:3000` 即可开始流畅的全栈开发调试！

### 模式二：全栈集成环境预览（模拟线上）
如果你在即将上线发布前，想要体验和验证代码在“完全上云构建后”单入口工作的一体化真实效果，可以使用此模式。

**执行一键预览：**
```bash
# 1. 在项目根目录，一次性打包且构建 Next.js 产物（将输出到 frontend/out）
npm run build:frontend

# 2. 启动包含静态资源 Worker 集成的 Wrangler Dev
npx wrangler dev --remote
```

然后，在浏览器打开 Worker 分配的本地地址（通常为 `http://localhost:8787`）。此时前端页面和后端 `/chat` 等 API 将完全由这一个集成服务来呈现与处理，与线上环境的表现 100% 相同。

---

## 🚀 2. 生产环境部署方案

由于我们在 `package.json` 的 `deploy` 命令中集成并固化了全部构建步骤，因此你只需要两步即可一键发布整个全栈应用上线。

### 准备环境
确保你之前已经在本地终端登录配置过你的 Cloudflare 账户。目前由于 Worker 使用了 `--remote` 的云端 Vectorize 等服务组件，所以登录是必须的：
```bash
npx wrangler login
```

### 一键部署
直接在项目根目录运行部署命令：
```bash
npm run deploy
```

> **它的工作原理是什么？**
> 1. npm 执行 `build:frontend`：自动进入 `frontend` 目录安装最新依赖，执行 `next build` 构建。（我们在 `next.config.ts` 中配置了 `output: "export"`）。
> 2. Next.js 会将页面生成纯静态 HTML/CSS/JS 资源，输出至 `frontend/out` 文件夹。
> 3. npm 接着执行 `wrangler deploy`：向 Cloudflare 云端发布 Worker。
> 4. 在云端编译并部署时，Wrangler 会读取 `wrangler.toml` 中的 `[assets]` 配置区，将前面打包好的 `frontend/out` 静态文件一起打包并上载至此 Worker 中。
> 5. 当外部直接使用浏览器请求此应用域名时，对于那些不属于你后台自身接管的 API 路由，`worker.ts` 中 Hono 的兜底路由 `app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))` 便会自动响应用户对应的网页。

部署进度流转完成后，终端界面会向你输出形如 `https://embedding-app.<your-subdomain>.workers.dev` 的线上最终全站地址。
