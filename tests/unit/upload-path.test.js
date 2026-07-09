import { describe, it, expect } from 'vitest';
import { buildUploadPath } from '@/api/wedflowClient';

describe('buildUploadPath', () => {
  it('prefixes the wedding id and preserves the filename', () => {
    const p = buildUploadPath('wed-123', 'receipt.pdf');
    expect(p.startsWith('wed-123/')).toBe(true);
    expect(p.endsWith('-receipt.pdf')).toBe(true);
  });

  it('produces a unique path each call', () => {
    const a = buildUploadPath('w', 'f.png');
    const b = buildUploadPath('w', 'f.png');
    expect(a).not.toBe(b);
  });
});
