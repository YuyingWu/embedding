// ── CORS ──────────────────────────────────────────────────────
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── AI Models ─────────────────────────────────────────────────
export const AI_EMBEDDING_MODEL = '@cf/baai/bge-m3';
export const AI_LLM_MODEL = '@cf/meta/llama-3.1-8b-instruct-awq';

// ── Vectorize defaults ─────────────────────────────────────────
export const VECTORIZE_DEFAULT_TOP_K = 5;
export const VECTORIZE_DEFAULT_MIN_SCORE = 0.40;
