import { describe, expect, it } from 'vitest';
import { healthPayload } from './health';

describe('health', () => {
  it('reports the service as ok', () => {
    expect(healthPayload()).toEqual({ status: 'ok', service: 'Sauda' });
  });
});
