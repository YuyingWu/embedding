# Cloudflare RAG & Embedding App

## 项目简介

本项目是一个基于 Cloudflare 生态（“全家桶”）的 RAG (Retrieval-Augmented Generation，检索增强生成) 应用。利用 Cloudflare Workers、Cloudflare Workers AI 和 Cloudflare Vectorize 构建一个无服务器的端到端问答系统。

当前工程的核心目标如下：

1. **内容向量化与存储 (Vectorization & Storage)**：
   将本地的内容文档（如 Markdown 文件）进行切片（Chunking），利用 Cloudflare Workers AI 提供的嵌入模型（例如当前使用的 `@cf/baai/bge-m3`）将其转化为向量（Embeddings），并存储在 Cloudflare 的向量数据库 Vectorize 中。

2. **基于大模型的 RAG 信息检索与返回 (RAG & LLM Generation)**：
   接收用户的查询请求（Query），将其实时转化为向量后，在 Vectorize 数据库中检索语义最相关的原文段落（Context）。随后，将检索出的上下文结合用户的 Prompt，利用 Cloudflare Workers AI 调用免费的大型语言模型（LLM，例如 Llama 系列），生成并返回最终的智能回答。

## 系统架构设计

本系统采用完全 Serverless 的架构模式，依托 Cloudflare 生态圈完成。整体工作流分为两个主要阶段：**知识库构建（Offline 阶段）** 和 **问答检索与生成（Online 阶段）**。

```mermaid
graph TD
    subgraph Offline[阶段一: 知识库构建 / 文档向量化]
        A[本地文档 / Markdown] -->|sync-content.mjs| B[文件读取与分块切片]
        B -->|POST /insert HTTP 请求| C[Cloudflare Worker]
        C -->|调用 @cf/baai/bge-m3| D[Cloudflare Workers AI\n文本转向量]
        D -->|Vector Embeddings| E[(Cloudflare Vectorize\n向量数据库)]
    end

    subgraph Online[阶段二: RAG 检索并生成回答]
        F[用户 Query 请求] -->|GET /search?q=...| C
        C -->|调用 @cf/baai/bge-m3| G[Cloudflare Workers AI\nQuery转向量]
        G -->|相似度检索| E
        E -.->|返回最相关的段落 Context| C
        C -->|Context + Query| H[Cloudflare Workers AI\nLLM推理 (如 Llama 3)]
        H -.->|生成自然语言| I[最终答案返回]
    end
    
    style Offline fill:#f9f2f4,stroke:#333,stroke-width:1px;
    style Online fill:#e6f2ff,stroke:#333,stroke-width:1px;
    style E fill:#fff2cc,stroke:#d6b656,stroke-width:2px;
    style C fill:#d5e8d4,stroke:#82b366,stroke-width:2px;
```

### 各核心模块的作用及关系：

1. **同步脚本 (`sync-content.mjs`)**：负责离线数据处理。它读取本地的内容（如 Markdown），将长文本切分成长度适中的段落，并批量传给云端 Worker。
2. **核心业务中枢 (`worker.js`)**：不仅作为 API 路由的入口，更充当串统各个 AI 服务的枢纽。负责请求的验证、与 AI 模型的交互、读写 Vectorize。
3. **AI 推理引擎 (`Cloudflare Workers AI`)**：提供双重能力：一方面利用 Embedding 模型完成段落和搜索词向量化，另一方面使用免费的 LLM 大语言模型基于 Context 进行逻辑推导和问答生成。
4. **向量数据库 (`Cloudflare Vectorize`)**：针对 Workers AI 计算出的高维向量特征数据（如 1024 维）做快速的增删改以及基于余弦相似度（Cosine Similarity）的匹配。

## 文件结构说明

- **`worker.js`**：Cloudflare Worker 后端主程序，目前实现了两个接口：
  - `POST /insert`：接收文档切片请求，调用 AI 返回文档 Embeddings，写入到 Vectorize 数据库中。
  - `GET /search`：接收用户查询词，通过 AI 生成查询向量检索 Vectorize 并返回匹配项。（待进一步结合 LLM 提供最终的 RAG 总结输出）。
- **`sync-content.mjs`**：Node.js 同步脚本。负责读取外部文件夹（`./content` 下的 `year-2025.md` 等）的内容，按段落和固定长度进行文本切片，并分发至 Worker 服务的 `/insert` 接口。
- **`wrangler.toml`**：Wrangler 的配置文件，绑定了 AI（`binding = "AI"`）和 Vectorize 向量库（`binding = "VECTORIZE"`，名称为 `markdown-vectors`）。
- **`package.json`**：项目依赖描述文件和常用脚本定义。

## 运行与部署指南

### 1. 安装依赖

```bash
npm install
```

### 2. 准备 Vectorize 数据库

确保已通过 Wrangler 创建与之匹配的 Vectorize 索引：
```bash
npx wrangler vectorize create markdown-vectors --dimensions=1024 --metric=cosine
```
*(注意：`@cf/baai/bge-m3` 模型的输出维度为 1024)*

### 3. 启动本地开发服务器

运行以下命令启动 Worker（带上 `--remote` 访问远程资源）：
```bash
npm run dev
```
Worker 默认将在 `http://localhost:8787` 运行。

### 4. 向量化本地文档并存入 Vectorize

准备好待分析的文档存放于 `./content` 目录下，并在新终端中执行：
```bash
node sync-content.mjs
```
脚本将切割文档，并分发上传至 `POST http://localhost:8787/insert` 完成向量生成和存储。

### 5. 执行搜索查询

发起 GET 请求进行搜索测试：
```bash
curl "http://localhost:8787/search?q=你需要查询的内容"
```
当前接口将返回与查询相关度最高的文档片段。

## 下一步计划 (TODO)
- **接入大型语言模型 (LLM)**：在 `/search` 拿到相似文本块后，将其组合成上下文 Context，并结合用户的 Query，通过 `env.AI.run()` 发送至系统免费的大型对话模型（如 `@cf/meta/llama-3-8b-instruct`）进行归纳整理，将生成式的自然语言反馈返回给用户。
