import fs from 'fs/promises';
import path from 'path';

const CONTENT_DIR = './content';
const WORKER_URL = 'http://localhost:8787/insert';
const DELETE_WORKER_URL = 'http://localhost:8787/delete';

// Markdown text chunking parameters
const MAX_CHUNK_LENGTH = 1000;
// 假设单个文件过去最多被切分成 200 个块，设定最大猜测删除范围
const MAX_CHUNKS_PER_FILE_TO_DELETE = 200;

async function sync() {
  const files = ['year-2025.md'];
  let allChunks = [];

  for (const file of files) {
    console.log(`\nProcessing file: ${file}...`);

    // 1. 先尝试删除 Vectorize 中该文件旧的所有可能存在的 Chunk 记录
    // 我们不知道远端实际存了多少个，所以猜测并提交最多 200 个旧 ID 列表强制删除。
    // 由于 Vectorize delete API 每次最多只能传 100 个 ID，因此分批处理
    const totalIdsToDelete = Array.from({ length: MAX_CHUNKS_PER_FILE_TO_DELETE }, (_, i) => `${file}-${i}`);

    // 按 100 批量发送删除请求
    const DELETE_BATCH_SIZE = 100;
    let deletedCount = 0;

    for (let j = 0; j < totalIdsToDelete.length; j += DELETE_BATCH_SIZE) {
      const batchIds = totalIdsToDelete.slice(j, j + DELETE_BATCH_SIZE);
      try {
        console.log(`Sending delete request for batch ${j / DELETE_BATCH_SIZE + 1} (${batchIds.length} IDs) for ${file}...`);
        const deleteResponse = await fetch(DELETE_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: batchIds })
        });

        if (!deleteResponse.ok) {
          console.error(`Failed to delete old chunks for ${file} in batch ${j / DELETE_BATCH_SIZE + 1}:`, await deleteResponse.text());
        } else {
          const delResult = await deleteResponse.json();
          if (delResult.deleted?.count) deletedCount += delResult.deleted.count;
        }
      } catch (err) {
        console.warn(`Could not reach delete endpoint for ${file} (Ignored):`, err.message);
      }
    }
    console.log(`Successfully purged old chunks for ${file}. Total affected count: ${deletedCount}`);



    let content = await fs.readFile(path.join(CONTENT_DIR, file), 'utf-8');

    // 预处理：提前全局过滤掉 Markdown 图片语法以及图片相关的 oss 地址
    // 匹配如 !["xxx"](https://wyy-static.oss... ) 格式
    content = content.replace(/!\[.*?\]\([^\)]*oss[^\)]*\)/gi, '');
    // 匹配任何可能散落的独立 oss/aliyuncs 地址
    content = content.replace(/https?:\/\/[^\s]*(oss-|aliyuncs)[^\s]*/gi, '');

    // Simple naive chunking by paragraphs to avoid hitting AI model limits
    const paragraphs = content.split(/\n\s*\n/);
    const urlRegex = /https?:\/\/[^\s]+/i;
    let currentChunk = '';
    let chunkIndex = 0;

    for (const p of paragraphs) {
      // 忽略包含 URL 的段落
      if (urlRegex.test(p)) {
        continue;
      }

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
