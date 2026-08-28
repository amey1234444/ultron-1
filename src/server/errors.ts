import type { NextApiResponse } from 'next';

// Shared API error type. Handlers translate ApiError into an HTTP status +
// JSON body; anything else becomes an opaque 500.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function logServerError(context: string, err: unknown) {
  if (err instanceof Error) {
    console.error(`[${context}] ${err.name}: ${err.message}\n${err.stack ?? '(no stack available)'}`);
    return;
  }
  console.error(`[${context}] non-error throw`, err);
}

export function sendApiError(res: NextApiResponse, err: unknown, context: string) {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
  logServerError(context, err);
  return res.status(500).json({ error: 'Internal server error.' });
}
