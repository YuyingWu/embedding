# Cloudflare RAG + Next.js AMA Assistant Plan

## Objective
Enhance the existing Cloudflare Workers backend to support LLM generation (using Qwen) and build a new Next.js chat frontend. The system acts as a strict personal assistant (Ask Me Anything) that only answers using retrieved context from Vectorize, failing gracefully with "抱歉，这个问题暂时没办法回答。" when context is missing or irrelevant.

## Architecture
- **Backend**: Cloudflare Worker (`worker.js`) exposing a new `/chat` endpoint.
- **Frontend**: Next.js App Router (`/frontend` directory).
- **Communication**: Frontend calls Worker directly. `worker.js` must implement CORS.
- **Streaming**: Uses Vercel AI SDK (`ai` and `@ai-sdk/react`) to handle streaming SSE from the Worker.
- **LLM Model**: Cloudflare Workers AI using `@cf/qwen/qwen1.5-14b-chat-awq`.

## Strict Fallback Logic
If `matches.length === 0` OR `matches[0].score < 0.75` from Vectorize:
**Do not call the LLM**. Immediately return the fallback string in a format compatible with the Vercel AI SDK stream.
Fallback string: `抱歉，这个问题暂时没办法回答。`

## System Prompt
```
你是一名私人助理，这是一个ask me anything的问答系统，只可以回答跟主人公相关（知识库内匹配的信息）的信息。
如果完全没有匹配的信息，或者无法根据提供的上下文回答，你必须严格输出："抱歉，这个问题暂时没办法回答。"
不要编造任何知识库以外的内容。
```

---

## Tasks

- [x] **Task 1: Initialize Next.js Frontend**
  - **Description**: Scaffold a new Next.js 14 project.
  - **Agent**: `quick`
  - **Skills**: `git-master`
  - **Steps**:
    1. Run `npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes` in `/mnt/d/playground/embedding`.
    2. Navigate into `./frontend` and install the Vercel AI SDK: `npm install ai @ai-sdk/react`.
  - **QA**: `ls ./frontend/package.json` exists and contains `"ai"` dependency.

- [x] **Task 2: Update Worker Backend (CORS, RAG, & Qwen LLM)**
  - **Description**: Implement the `/chat` endpoint with Vectorize Top K=10, strict fallback, Qwen LLM generation, and CORS.
  - **Agent**: `deep`
  - **Skills**: `git-master`
  - **Steps**:
    1. Add a global CORS handler to `worker.js` to accept `OPTIONS` requests and append `Access-Control-Allow-Origin: *` to all responses.
    2. Create a `POST /chat` endpoint.
    3. Parse the last user message from the request body (`messages` array).
    4. Run embedding `@cf/baai/bge-m3` on the user message.
    5. Query Vectorize `markdown-vectors` with `topK: 10`.
    6. **Fallback check**: If `matches.length === 0` or `matches[0].score < 0.75`, return a simulated SSE stream (compatible with Vercel AI SDK `text/x-unknown` or standard `text/event-stream` using the `0:"text"` protocol) containing only: `抱歉，这个问题暂时没办法回答。`.
    7. If score >= 0.75, build the context string from `matches.map(m => m.metadata.text).join('

')`.
    8. Construct the prompt using the System Prompt + Context + User Question.
    9. Call `@cf/qwen/qwen1.5-14b-chat-awq` (or similar Qwen model) with `stream: true`.
    10. Transform the Cloudflare AI stream into the Vercel AI Stream format (or return as-is if using custom parser on frontend) and return with appropriate streaming headers.
  - **QA**: 
    - `curl -X OPTIONS http://localhost:8787/chat -i` returns CORS headers. 
    - `curl -X POST http://localhost:8787/chat -d '{"messages":[{"role":"user","content":"unrelated gibberish"}]}'` returns the fallback string.
  - **Description**: Implement the `/chat` endpoint with Vectorize Top K=10, strict fallback, Qwen LLM generation, and CORS.
  - **Agent**: `deep`
  - **Skills**: `git-master`
  - **Steps**:
    1. Add a global CORS handler to `worker.js` to accept `OPTIONS` requests and append `Access-Control-Allow-Origin: *` to all responses.
    2. Create a `POST /chat` endpoint.
    3. Parse the last user message from the request body (`messages` array).
    4. Run embedding `@cf/baai/bge-m3` on the user message.
    5. Query Vectorize `markdown-vectors` with `topK: 10`.
    6. **Fallback check**: If `matches.length === 0` or `matches[0].score < 0.75`, return a simulated SSE stream (compatible with Vercel AI SDK `text/x-unknown` or standard `text/event-stream` using the `0:"text"` protocol) containing only: `抱歉，这个问题暂时没办法回答。`.
    7. If score >= 0.75, build the context string from `matches.map(m => m.metadata.text).join('

')`.
    8. Construct the prompt using the System Prompt + Context + User Question.
    9. Call `@cf/qwen/qwen1.5-14b-chat-awq` (or similar Qwen model) with `stream: true`.
    10. Transform the Cloudflare AI stream into the Vercel AI Stream format (or return as-is if using custom parser on frontend) and return with appropriate streaming headers.
  - **QA**: 
    - `curl -X OPTIONS http://localhost:8787/chat -i` returns CORS headers. 
    - `curl -X POST http://localhost:8787/chat -d '{"messages":[{"role":"user","content":"unrelated gibberish"}]}'` returns the fallback string.

- [x] **Task 3: Implement Next.js Chat UI**
  - **Description**: Build a clean chat interface using Tailwind and Vercel AI SDK.
  - **Agent**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`, `playwright`, `git-master`
  - **Steps**:
    1. Replace `frontend/src/app/page.tsx` with a Chat UI.
    2. Use the `useChat` hook from `@ai-sdk/react`.
    3. Configure `api: 'http://localhost:8787/chat'` in `useChat`.
    4. Implement message mapping, a text input, and a submit button.
    5. Style with Tailwind CSS.
  - **QA**: Playwright script successfully loads `http://localhost:3000`, types a message, submits, and verifies a response is rendered.

## Final Verification Wave
1. Ensure both the `dev` worker (`npm run dev` in root) and Next.js dev server (`npm run dev` in frontend) start without errors.
2. Verify cross-origin communication works.
3. Verify both high-confidence (in knowledge base) and low-confidence (fallback) queries behave correctly in the UI.