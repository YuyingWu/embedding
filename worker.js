const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      return await handleRequest(request, env);
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/insert' && request.method === 'POST') {
    const data = await request.json();
    if (!data.chunks || !Array.isArray(data.chunks)) {
      return new Response('Invalid input', { status: 400, headers: corsHeaders });
    }

    if (data.chunks.length === 0) {
      return Response.json({ success: true, inserted: { count: 0 }, message: 'No chunks provided.' }, { headers: corsHeaders });
    }

    const texts = data.chunks.map(c => c.text);
    const aiResponse = await env.AI.run('@cf/baai/bge-m3', { text: texts });

    const vectors = data.chunks.map((chunk, index) => ({
      id: chunk.id,
      values: aiResponse.data[index],
      metadata: { text: chunk.text }
    }));

    const inserted = await env.VECTORIZE.upsert(vectors);
    return Response.json({ success: true, inserted }, { headers: corsHeaders });
  }

  if (url.pathname === '/search' && request.method === 'GET') {
    const query = url.searchParams.get('q');
    if (!query) {
      return new Response('Missing query param q', { status: 400, headers: corsHeaders });
    }

    const aiResponse = await env.AI.run('@cf/baai/bge-m3', { text: [query] });
    const queryVector = aiResponse.data[0];

    const matches = await env.VECTORIZE.query(queryVector, {
      topK: 5,
      returnValues: false,
      returnMetadata: "all"
    });
    matches.matches = matches.matches.filter(m => m.score >= 0.30);

    return Response.json({ results: matches.matches }, { headers: corsHeaders });
  }

  if (url.pathname === '/delete' && request.method === 'POST') {
    const data = await request.json();
    if (!data.ids || !Array.isArray(data.ids) || data.ids.length === 0) {
      return new Response('Missing or invalid query param ids array', { status: 400, headers: corsHeaders });
    }

    const results = await env.VECTORIZE.deleteByIds(data.ids);
    return Response.json({ success: true, deleted: results }, { headers: corsHeaders });
  }

  if (url.pathname === '/chat' && request.method === 'POST') {
    const data = await request.json();
    const messages = data.messages || [];
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== 'user') {
      return new Response('Invalid messages array', { status: 400, headers: corsHeaders });
    }

    // @ai-sdk/react v3 sends messages as { role, parts: [{type:'text', text:'...'}] }
    // Fallback to legacy { role, content: string } format
    const userQuestion = lastMessage.parts
      ? lastMessage.parts.filter(p => p.type === 'text').map(p => p.text).join('')
      : (lastMessage.content || '');

    if (!userQuestion) {
      return new Response('Empty user question', { status: 400, headers: corsHeaders });
    }

    const encoder = new TextEncoder();

    // 1. Embed the user question
    const aiResponse = await env.AI.run('@cf/baai/bge-m3', { text: [userQuestion] });
    const queryVector = aiResponse.data[0];

    // 2. Query Vectorize top-10
    const matches = await env.VECTORIZE.query(queryVector, {
      topK: 10,
      returnValues: false,
      returnMetadata: "all"
    });

    // 3. Strict fallback: no matches or top score < 0.75
    if (!matches.matches || matches.matches.length === 0 || matches.matches[0].score < 0.75) {
      const fallbackText = '抱歉，这个问题暂时没办法回答。';
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(fallbackText));
          controller.close();
        }
      });
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=utf-8',
        }
      });
    }

    // 4. Build context from matched chunks
    const context = matches.matches.map(m => m.metadata.text).join('\n\n');

    // 5. System prompt
    const systemPrompt = `你是一名私人助理，这是一个ask me anything的问答系统，只可以回答跟主人公相关（知识库内匹配的信息）的信息。
如果完全没有匹配的信息，或者无法根据提供的上下文回答，你必须严格输出："抱歉，这个问题暂时没办法回答。"
不要编造任何知识库以外的内容。

上下文信息：
${context}`;

    // Normalize to plain content strings for Cloudflare AI (doesn't accept parts format)
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role,
        content: m.parts
          ? m.parts.filter(p => p.type === 'text').map(p => p.text).join('')
          : (m.content || '')
      }))
    ];

    // 6. Call Qwen with streaming
    const llmStream = await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', {
      messages: llmMessages,
      stream: true
    });

    // 7. Transform Cloudflare SSE (data: {"response":"..."}) → Vercel AI SDK v3 (0:"..."\n)
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = llmStream.getReader();
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
                const chunk = JSON.parse(line.slice(6));
                if (chunk.response) {
                  // TextStreamChatTransport expects raw UTF-8 text, not 0:"..." protocol
                  await writer.write(encoder.encode(chunk.response));
                }
              } catch (e) {
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

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
      }
    });
  }

  return new Response('Not found', { status: 404, headers: corsHeaders });
}
