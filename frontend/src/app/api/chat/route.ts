export async function POST(req: Request) {
  const fallbackText = '抱歉，这个问题暂时没办法回答。';
  const stream = new ReadableStream({
    async start(controller) {
      for (const char of fallbackText) {
        controller.enqueue(new TextEncoder().encode(char));
        await new Promise(r => setTimeout(r, 50));
      }
      controller.close();
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    }
  });
}
