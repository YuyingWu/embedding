import fs from 'fs/promises';
import path from 'path';

const CONTENT_DIR = './content';
const WORKER_URL = 'http://localhost:8787/insert';

// Markdown text chunking parameters
const MAX_CHUNK_LENGTH = 1000;

async function sync() {
  const files = ['year-2025.md'];
  let allChunks = [];

  for (const file of files) {


    const content = await fs.readFile(path.join(CONTENT_DIR, file), 'utf-8');

    // Simple naive chunking by paragraphs to avoid hitting AI model limits
    const paragraphs = content.split(/\n\s*\n/);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const p of paragraphs) {
      if ((currentChunk.length + p.length) > MAX_CHUNK_LENGTH && currentChunk.length > 0) {
        allChunks.push({
          id: `${file}-${chunkIndex++}`,
          text: currentChunk.trim()
        });
        currentChunk = '';
      }
      currentChunk += p + '\n\n';
    }

    if (currentChunk.trim().length > 0) {
      allChunks.push({
        id: `${file}-${chunkIndex++}`,
        text: currentChunk.trim()
      });
    }
  }

  console.log(`Prepared ${allChunks.length} chunks from ${files.length} files.`);

  // We should send in batches to avoid payload size or AI rate limits.
  const BATCH_SIZE = 10;
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    console.log(`Sending batch ${i / BATCH_SIZE + 1} (${batch.length} chunks)...`);

    try {
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunks: batch })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error from worker:', errorText);
      } else {
        const result = await response.json();
        console.log('Success:', Object.keys(result.inserted).length, 'chunks inserted');
      }
    } catch (e) {
      console.error('Failed to send batch:', e);
    }
  }
}

sync().catch(console.error);
