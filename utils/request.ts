import { CORS_HEADERS } from './const';

/** Return a JSON response with CORS headers */
export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: CORS_HEADERS,
  });
}

/** Return a plain-text error response with CORS headers */
export function errorResponse(message: string, status = 400): Response {
  return new Response(message, {
    status,
    headers: CORS_HEADERS,
  });
}

/** Return a streaming text response with CORS headers */
export function streamResponse(body: ReadableStream): Response {
  return new Response(body, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}