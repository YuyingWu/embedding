import {
  AI_EMBEDDING_MODEL,
  VECTORIZE_DEFAULT_TOP_K,
  VECTORIZE_DEFAULT_MIN_SCORE,
} from './const';

export interface QueryVectorizeOptions {
  topK?: number;
  minScore?: number;
}

/**
 * Embed a text query and search Vectorize for the closest vectors.
 *
 * @param env       - Worker env bindings (AI, VECTORIZE)
 * @param queryText - The natural-language query to embed
 * @param options   - Optional topK and minScore thresholds
 */
export async function queryVectorize(
  env: Env,
  queryText: string,
  {
    topK = VECTORIZE_DEFAULT_TOP_K,
    minScore = VECTORIZE_DEFAULT_MIN_SCORE,
  }: QueryVectorizeOptions = {}
): Promise<VectorizeMatch[]> {
  const aiResponse = await env.AI.run(AI_EMBEDDING_MODEL, { text: [queryText] });
  const queryVector = (aiResponse as { data: number[][] }).data[0];

  const result = await env.VECTORIZE.query(queryVector, {
    topK,
    returnValues: false,
    returnMetadata: 'all',
  });

  let matches: VectorizeMatch[] = result.matches || [];
  if (minScore !== undefined) {
    matches = matches.filter((m) => m.score >= minScore);
  }
  return matches;
}