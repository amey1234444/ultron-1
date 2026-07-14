// Shared API error type. Handlers translate ApiError into an HTTP status +
// JSON body; anything else becomes an opaque 500.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
