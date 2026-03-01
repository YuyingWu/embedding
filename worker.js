export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/insert' && request.method === 'POST') {
      try {
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
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    if (url.pathname === '/search' && request.method === 'GET') {
      try {
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
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    if (url.pathname === '/delete' && request.method === 'POST') {
      try {
        const data = await request.json();
        if (!data.ids || !Array.isArray(data.ids) || data.ids.length === 0) {
          return new Response('Missing or invalid query param ids array', { status: 400 });
        }

        // Delete from the Vectorize index
        const results = await env.VECTORIZE.deleteByIds(data.ids);

        return Response.json({ success: true, deleted: results });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};