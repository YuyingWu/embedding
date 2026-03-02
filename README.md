# Cloudflare RAG & Embedding App

## 项目简介

本项目是一个基于 Cloudflare 生态（“全家桶”）的全栈 RAG (Retrieval-Augmented Generation，检索增强生成) 应用。
应用分为 **前端（Next.js）** 与 **后端（Cloudflare Worker）**，并在部署时利用 Cloudflare Workers Static Assets 绑定在同一个服务和域名下，无缝实现端到端的 AI 智能问答系统。

当前工程的核心功能：
1. **内容向量化与存储 (Offline)**：将本地 Markdown 等知识库文档切片，利用 Cloudflare Workers AI (`@cf/baai/bge-m3`) 转化为高维向量，并存储在 Cloudflare Vectorize 数据库中。
2. **全栈智能问答 (Online)**：拥有现代化的 Next.js 网页聊天界面。后端接收 Query 后，实时检索最接近的知识片段，再结合大型语言模型 (`@cf/meta/llama-3.1-8b-instruct-awq`) 进行流式 (Streaming) 自然语言推理与对话。

---

## 系统架构设计

系统将业务逻辑清晰地拆分为两大模块：**前端交互模块 (Frontend)** 和 **后端 AI 服务模块 (Backend)**。

### 1. 前端交互模块 (`frontend/`)
采用 **Next.js (App Router)** 框架构建的现代化单页网页前端。
- **动态交互**：使用 Vercel AI SDK (`@ai-sdk/react`) 提供类似于 ChatGPT 的流式打字机对话体验。
- **静态导出**：配置了 `output: "export"`，在构建时将所有页面和组件转化为静态 HTML/CSS/JS 资源。
- **自动环境适配**：代码自动侦测开发环境，本地调试时跨域请求运行在 8787 端口的后端调试服 (`http://localhost:8787`)；生产打包后使用智能相对路径进行同源请求。

### 2. 后端 AI 服务模块 (`worker.ts` / 根目录)
采用 **Cloudflare Workers** 打造的 Serverless 服务中心，串联所有 AI 服务。
- **静态资产托管 (Static Assets)**：自动捕获并返回前端构建后的产物资源。
- **RAG 智能对话接口 (`POST /chat`)**：响应前端的对话请求。
  - *Retrieve*：接收问题，通过 `@cf/baai/bge-m3` 模型将文本转化为向量。
  - *Search*：检索 Cloudflare Vectorize 数据库，获取相关度最高（且符合置信度阈值）的短句上下文。
  - *Generate*：严谨的 System Prompt 控制模型必须根据上下文回答，调用流式大模型 `@cf/meta/llama-3.1-8b-instruct-awq` 并进行 SSE 数据格式转换推送给前端。
- **数据入库接口 (`POST /insert` & `POST /delete`)**：响应内部数据维护脚本，支持增量知识片段库的管理。

---

## 核心文件结构解析

- **`/frontend/`**：Next.js 前端代码库，UI 及组件。
- **`worker.ts`**：后端主程序入口，使用 **Hono** 路由框架按路径独立注册各 API 接口（`/insert`、`/search`、`/delete`、`/chat`）。
- **`/utils/`**：后端公共模块。
  - `const.ts`：CORS 头、AI 模型名、查询默认参数等常量。
  - `request.ts`：`jsonResponse` / `errorResponse` / `streamResponse` 统一响应工具函数。
  - `ai_worker.ts`：`queryVectorize` — 向量化查询 + Vectorize 检索的核心函数。
- **`sync-content.mjs`**：Node.js 工具脚本，负责读取本地 `./content` 下的文件，分块切割后同步至云端 Worker 入库。
- **`wrangler.toml`**：核心云端部署文件，清晰定义了绑定的云资源：大型模型 AI 引擎 (`binding = "AI"`)、向量数据库 (`binding = "VECTORIZE"`) 以及静态页面托管 (`[assets]`)。

---

## 🛠 开发与部署指南

项目已实现完全的自动化构建与环境隔离解耦。

无论是**本地开发时的全栈独立热更新方案**，还是**一键自动上云部署方案 (npm run deploy)**，详细的步骤都浓缩在专项文档中，请查阅：

👉 **[开发与部署指南 (DEV.md)](./DEV.md)**

---

## 🏗 数据准备 (文档导入向量库)

在你能对机器人发起提问之前，必须先将知识源写入向量引擎：

1. **初始化 Vectorize 索引库** (1024 维度对应使用的高精度嵌入模型)：
   ```bash
   npx wrangler vectorize create markdown-vectors --dimensions=1024 --metric=cosine
   ```
2. **启动本地开发后端**：
   ```bash
   npm run dev
   ```
3. **入库文档**：打开一个新的命令终端，运行同步脚本，将 `./content` 文件夹中的 `.md` 文档分析入库：
   ```bash
   node sync-content.mjs
   ```
   *(脚本将自动切割长文档并推送到本机的 Worker，最终保存到云端的 Vectorize 数据库中)*
