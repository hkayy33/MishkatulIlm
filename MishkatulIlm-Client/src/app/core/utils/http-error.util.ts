import { HttpErrorResponse } from '@angular/common/http';

export function formatHttpError(err: unknown, fallback: string): string {
  if (!(err instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body = err.error;
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  if (typeof body === 'string' && body.trim()) {
    return body;
  }

  if (err.status === 404) {
    return `${fallback} (API not found — restart the MishkatulIlm API server and try again.)`;
  }

  if (err.status === 401 || err.status === 403) {
    return `${fallback} (you may not be signed in as an admin).`;
  }

  if (err.status > 0) {
    return `${fallback} (HTTP ${err.status}).`;
  }

  return fallback;
}
