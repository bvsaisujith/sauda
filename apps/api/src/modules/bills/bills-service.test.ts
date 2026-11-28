import { describe, expect, it } from 'vitest';
import { billStatus } from '@sauda/shared';

describe('bill status', () => {
  it('is unpaid when nothing has been paid', () => {
    expect(billStatus(50_000, 0)).toBe('unpaid');
  });

  it('is partial when something has been paid but not the whole bill', () => {
    expect(billStatus(50_000, 20_000)).toBe('partial');
  });

  it('is paid when the payments cover the total', () => {
    expect(billStatus(50_000, 50_000)).toBe('paid');
  });

  it('treats overpayment as paid', () => {
    expect(billStatus(50_000, 60_000)).toBe('paid');
  });
});