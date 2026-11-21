import { APP_NAME, type Health } from '@sauda/shared';

export function healthPayload(): Health {
  return { status: 'ok', service: APP_NAME };
}
