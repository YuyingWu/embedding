import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CORS_HEADERS, AI_EMBEDDING_MODEL, AI_LLM_MODEL } from './utils/const';
import { jsonResponse, errorResponse, streamResponse } from './utils/request';
import { queryVectorize } from './utils/ai_worker';

const app = new Hono<{ Bindings: Env }>();

// ── CORS middleware ────────────────────────────────────────────
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
  allowHeaders: ['Content-Type'],
}));

// ── POST /insert ───────────────────────────────────────────────
app.post('/insert', async (c) => {
  const data = await c.req.json<{ chunks?: { id: string; text: string }[] }>();
  if (!data.chunks || !Array.isArray(data.chunks)) {
    return errorResponse('Invalid input');
  }

  if (data.chunks.length === 0) {
    return jsonResponse({ success: true, inserted: { count: 0 }, message: 'No chunks provided.' });
  }

  const texts = data.chunks.map((ch) => ch.text);
  const aiResponse = await c.env.AI.run(AI_EMBEDDING_MODEL, { text: texts });

  const vectors = data.chunks.map((chunk, index) => ({
    id: chunk.id,
    values: (aiResponse as { data: number[][] }).data[index],
    metadata: { text: chunk.text },
  }));

  const inserted = await c.env.VECTORIZE.upsert(vectors);
  return jsonResponse({ success: true, inserted });
});

// ── GET /search ────────────────────────────────────────────────
app.get('/search', async (c) => {
  const query = c.req.query('q');
  if (!query) {
    return errorResponse('Missing query param q');
  }

  const results = await queryVectorize(c.env, query);
  return jsonResponse({ results });
});

// ── POST /delete ───────────────────────────────────────────────
app.post('/delete', async (c) => {
  const data = await c.req.json<{ ids?: string[] }>();
  if (!data.ids || !Array.isArray(data.ids) || data.ids.length === 0) {
    return errorResponse('Missing or invalid query param ids array');
  }

  const results = await c.env.VECTORIZE.deleteByIds(data.ids);
  return jsonResponse({ success: true, deleted: results });
});

// ── POST /chat ─────────────────────────────────────────────────
app.post('/chat', async (c) => {
  type Part = { type: string; text?: string };
  type Message = { role: string; content?: string; parts?: Part[] };

  const data = await c.req.json<{ messages?: Message[] }>();
  const messages = data.messages || [];
  const lastMessage = messages[messages.length - 1];

  if (!lastMessage || lastMessage.role !== 'user') {
    return errorResponse('Invalid messages array');
  }

  // @ai-sdk/react v3 sends messages as { role, parts: [{type:'text', text:'...'}] }
  // Fallback to legacy { role, content: string } format
  const userQuestion = lastMessage.parts
    ? lastMessage.parts.filter((p) => p.type === 'text').map((p) => p.text).join('')
    : (lastMessage.content || '');

  if (!userQuestion) {
    return errorResponse('Empty user question');
  }

  const encoder = new TextEncoder();

  // 1. Embed & query Vectorize
  const matches = await queryVectorize(c.env, userQuestion);

  console.log('User Question:', userQuestion);
  console.log('Matches Length:', matches.length);
  console.log('Top Match Score:', matches[0]?.score);
  console.log('Top Match Text Snippet:', (matches[0]?.metadata as { text?: string })?.text);

  // 2. Short-circuit if no relevant context was found
  if (matches.length === 0) {
    return new Response('抱歉，这个问题暂时没办法回答。', {
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // 3. Build context from matched chunks
  const context = matches.map((m) => (m.metadata as { text?: string })?.text).join('\n\n');

  // 4. System prompt
  const systemPrompt = `你是一名私人助理，这是一个ask me anything的问答系统，只可以回答跟主人公相关（知识库内匹配的信息）的信息。
如果完全没有匹配的信息，或者无法根据提供的上下文回答，你必须严格输出："抱歉，这个问题暂时没办法回答。"
不要编造任何知识库以外的内容。

上下文信息：
${context}`;

  // Normalize to plain content strings for Cloudflare AI (doesn't accept parts format)
  const llmMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role,
      content: m.parts
        ? m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('')
        : (m.content || ''),
    })),
  ];

  // 5. Call LLM with streaming
  const llmStream = await c.env.AI.run(AI_LLM_MODEL, {
    messages: llmMessages,
    stream: true,
  }) as ReadableStream;

  // 6. Transform Cloudflare SSE (data: {"response":"..."}) → raw UTF-8 text stream
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const reader = (llmStream as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const chunk = JSON.parse(line.slice(6)) as { response?: string };
              if (chunk.response) {
                await writer.write(encoder.encode(chunk.response));
              }
            } catch {
              // skip malformed SSE chunks
            }
          }
        }
      }
      await writer.close();
    } catch (e) {
      await writer.abort(e);
    }
  })();

  return streamResponse(readable);
});

// ── Fallback → serve static assets ────────────────────────────
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
