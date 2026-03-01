
## Frontend Initialization
- Next.js project initialized in `./frontend` using `create-next-app@latest`.
- Dependencies installed: `next`, `react`, `react-dom`, `ai`, `@ai-sdk/react`.
- Dev dependencies: `tailwindcss`, `typescript`, `eslint`.

## Worker Backend Implementation
- Implemented global CORS handling in `worker.js` by wrapping the main request handler and appending headers to all responses.
- Added `/chat` endpoint to handle RAG queries.
- Used `@cf/baai/bge-m3` for embedding user queries and queried Vectorize with `topK: 10`.
- Implemented strict fallback logic when Vectorize matches score < 0.75, returning a simulated SSE stream compatible with Vercel AI SDK (`0:"text"` protocol).
- Used `@cf/qwen/qwen1.5-14b-chat-awq` for LLM generation with streaming enabled.
- Transformed Cloudflare AI stream into Vercel AI Stream format (`0:"text"\n`) using `TransformStream`.
