import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), insert: vi.fn(), single: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
    insert: mocks.insert,
}) } }));
import { ensureProfile } from './gameRecordService';
beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
it('does not create a profile when its lookup fails', async () => {
    mocks.read.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    expect(await ensureProfile('id', 'name')).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
});
it('preserves an existing profile and rating', async () => {
    const profile = { id: 'id', name: 'existing', rating: 2300 };
    mocks.read.mockResolvedValue({ data: profile, error: null });
    expect(await ensureProfile('id', 'name')).toEqual(profile);
    expect(mocks.insert).not.toHaveBeenCalled();
});
it('creates only after a successful empty lookup', async () => {
    mocks.read.mockResolvedValue({ data: null, error: null });
    mocks.single.mockResolvedValue({ data: { id: 'id' }, error: null });
    expect(await ensureProfile('id', 'name')).toEqual({ id: 'id' });
    expect(mocks.insert).toHaveBeenCalledOnce();
});
it('reads the profile created by a competing tab without overwriting it', async () => {
    mocks.read.mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { id: 'id', rating: 2400 }, error: null });
    mocks.single.mockResolvedValue({ data: null, error: { code: '23505' } });
    expect(await ensureProfile('id', 'name')).toEqual({ id: 'id', rating: 2400 });
});
