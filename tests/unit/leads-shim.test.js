import { describe, it, expect } from 'vitest';
import { TABLE_MAP } from '@/api/entities-config';

describe('leads shim mapping', () => {
  it('maps the Lead entity to the leads table', () => {
    expect(TABLE_MAP.Lead).toBe('leads');
  });
});
