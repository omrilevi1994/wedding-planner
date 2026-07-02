import { describe, it, expect } from 'vitest';
import { synthUser } from '@/lib/WeddingContext';

const profile = { id: 'u1', email: 'a@b.com', full_name: 'A', is_platform_admin: false };

describe('synthUser', () => {
  it('merges active membership role/limits onto the profile', () => {
    const m = { role: 'family', wedding_sides: ['חתן'], max_guests: 10 };
    const u = synthUser(profile, m);
    expect(u).toMatchObject({ id: 'u1', role: 'family', wedding_sides: ['חתן'], max_guests: 10 });
  });
  it('null membership yields no role', () => {
    expect(synthUser(profile, null).role).toBeUndefined();
  });
  it('platform admin flag carries through', () => {
    expect(synthUser({ ...profile, is_platform_admin: true }, null).is_platform_admin).toBe(true);
  });
});
