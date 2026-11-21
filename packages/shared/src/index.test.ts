import { describe, expect, it } from 'vitest';
import { APP_NAME, healthSchema } from './index';

describe('shared contracts', () => {
  it('names the product', () => {
    expect(APP_NAME).toBe('Sauda');
  });

  it('accepts a valid health payload', () => {
    expect(healthSchema.parse({ status: 'ok', service: APP_NAME })).toEqual({
      status: 'ok',
      service: 'Sauda',
    });
  });

  it('rejects an invalid health payload', () => {
    expect(healthSchema.safeParse({ status: 'down' }).success).toBe(false);
  });
});
