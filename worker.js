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
      const response = await handleRequest(request, env);
      const newHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        newHeaders.set(key, value);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
    }
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/insert' && request.method === 'POST') {
    const data = await request.json();
    // data.chunks expected to be an array of objects: { id: string, text: string }
    if (!data.chunks || !Array.isArray(data.chunks)) {
      return new Response('Invalid input', { status: 400 });
    }

    if (data.chunks.length === 0) {
      return Response.json({ success: true, inserted: { count: 0 }, message: 'No chunks provided.' });
    }

    const texts = data.chunks.map(c => c.text);

    // Generate embeddings using the recommended Chinese model @cf/baai/bge-m3
    const aiResponse = await env.AI.run('@cf/baai/bge-m3', { text: texts });

    const vectors = data.chunks.map((chunk, index) => ({
      id: chunk.id,
      values: aiResponse.data[index],
      metadata: { text: chunk.text }
    }));

    // Insert into Vectorize index
    const inserted = await env.VECTORIZE.upsert(vectors);

    return Response.json({ success: true, inserted });
  }

  if (url.pathname === '/search' && request.method === 'GET') {
    const query = url.searchParams.get('q');
    if (!query) {
      return new Response('Missing query param q', { status: 400 });
    }

    // Generate embedding for the query
    const aiResponse = await env.AI.run('@cf/baai/bge-m3', { text: [query] });
    const queryVector = aiResponse.data[0];

    // Search the Vectorize index
    const matches = await env.VECTORIZE.query(queryVector, {
      topK: 5,
      returnValues: false,
      returnMetadata: "all"
    });

    return Response.json({ results: matches.matches });
  }

  if (url.pathname === '/delete' && request.method === 'POST') {
    const data = await request.json();
    if (!data.ids || !Array.isArray(data.ids) || data.ids.length === 0) {
      return new Response('Missing or invalid query param ids array', { status: 400 });
    }

    // Delete from the Vectorize index
    const results = await env.VECTORIZE.deleteByIds(data.ids);

    return Response.json({ success: true, deleted: results });
  }

  if (url.pathname === '/chat' && request.method === 'POST') {
    const data = await request.json();
    const messages = data.messages || [];
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== 'user') {
      return new Response('Invalid messages array', { status: 400 });
    }

    const userQuestion = lastMessage.content;

    // 1. Generate embedding for the user question
    const aiResponse = await env.AI.run('@cf/baai/bge-m3', { text: [userQuestion] });
    const queryVector = aiResponse.data[0];

    // 2. Query Vectorize
    const matches = await env.VECTORIZE.query(queryVector, {
      topK: 10,
      returnValues: false,
      returnMetadata: "all"
    });

    // 3. Fallback check
    if (!matches.matches || matches.matches.length === 0 || matches.matches[0].score < 0.75) {
      const fallbackText = "抱歉，这个问题暂时没办法回答。";
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`0:${JSON.stringify(fallbackText)}\n`));
          controller.close();
        }
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/x-unknown',
        }
      });
    }

    // 4. Build context
    const context = matches.matches.map(m => m.metadata.text).join('\n\n');

    // 5. Construct prompt
    const systemPrompt = `你是一名私人助理，这是一个ask me anything的问答系统，只可以回答跟主人公相关（知识库内匹配的信息）的信息。
如果完全没有匹配的信息，或者无法根据提供的上下文回答，你必须严格输出："抱歉，这个问题暂时没办法回答。"
不要编造任何知识库以外的内容。

上下文信息：
${context}`;

    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // 6. Call Qwen LLM
    const llmStream = await env.AI.run('@cf/qwen/qwen1.5-14b-chat-awq', {
      messages: llmMessages,
      stream: true
    });

    // 7. Transform stream to Vercel AI SDK format
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

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
                const data = JSON.parse(line.slice(6));
                if (data.response) {
                  await writer.write(encoder.encode(`0:${JSON.stringify(data.response)}\n`));
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
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
        'Content-Type': 'text/x-unknown',
      }
    });
  }

  return new Response('Not found', { status: 404 });
}
