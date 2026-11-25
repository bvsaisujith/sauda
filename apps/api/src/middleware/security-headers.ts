import type { NextFunction, Request, Response } from 'express';

/**
 * The API only ever returns JSON, so it can afford the strictest possible
 * policy: nothing may be loaded, framed or submitted from these responses.
 * Setting the headers here keeps the DAST baseline clean instead of teaching
 * it to ignore missing-header findings.
 */
export function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader(
    'content-security-policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('cross-origin-opener-policy', 'same-origin');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
  response.setHeader('strict-transport-security', 'max-age=63072000; includeSubDomains');
  next();
}
