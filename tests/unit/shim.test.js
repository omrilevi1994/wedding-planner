import { describe, it, expect } from 'vitest';
import { parseSort } from '@/api/base44Client';

describe('parseSort', () => {
  it('ascending by default', () => {
    expect(parseSort('name')).toEqual({ column: 'name', ascending: true });
  });
  it('descending with leading dash', () => {
    expect(parseSort('-created_date')).toEqual({ column: 'created_date', ascending: false });
  });
  it('returns null for empty', () => {
    expect(parseSort(undefined)).toBeNull();
  });
});
