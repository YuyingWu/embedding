import { Miniflare } from "miniflare";

const mf = new Miniflare({
  scriptPath: "worker.js",
  modules: true,
  bindings: {
    AI: {
      run: async (model, input) => {
        console.log(`Mock AI run: ${model}`, input);
        if (model === "@cf/baai/bge-m3") {
          return { data: [new Array(1024).fill(0)] };
        }
        if (model === "@cf/qwen/qwen1.5-14b-chat-awq") {
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"response":"Mock response"}\n'));
              controller.enqueue(encoder.encode('data: [DONE]\n'));
              controller.close();
            }
          });
          return stream;
        }
        return {};
      }
    },
    VECTORIZE: {
      query: async (vector, options) => {
        console.log("Mock Vectorize query", options);
        if (options.topK === 5) {
          // Search endpoint
          return { matches: [] };
        }
        if (options.topK === 10) {
          // Chat endpoint
          return { matches: [{ score: 0.5, metadata: { text: "Mock context" } }] };
        }
        return { matches: [] };
      }
    }
  }
});

async function runTests() {
  console.log("Testing /search?q=容祖儿");
  const res1 = await mf.dispatchFetch("http://localhost:8787/search?q=容祖儿");
  const json1 = await res1.json();
  console.log("Response:", JSON.stringify(json1));

  console.log("\nTesting /chat with 2025年");
  const res2 = await mf.dispatchFetch("http://localhost:8787/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "2025年" }] })
  });
  const text2 = await res2.text();
  console.log("Response:", text2);

  await mf.dispose();
}

runTests().catch(console.error);
