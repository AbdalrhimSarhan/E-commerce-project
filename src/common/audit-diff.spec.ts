import { diffChanges, escapeLike } from './audit-diff';

describe('diffChanges', () => {
  it('returns only changed fields with from/to', () => {
    expect(
      diffChanges(
        { name: 'Old', price: '1.00', categoryIds: ['a', 'b'], stock: 3 },
        { name: 'New', price: '1.00', categoryIds: ['a'], stock: 3 },
      ),
    ).toEqual({
      name: { from: 'Old', to: 'New' },
      categoryIds: { from: ['a', 'b'], to: ['a'] },
    });
  });

  it('returns an empty object when nothing changed', () => {
    expect(diffChanges({ a: 1 }, { a: 1 })).toEqual({});
  });

  it('uses null for missing values', () => {
    expect(diffChanges({}, { description: 'x' })).toEqual({
      description: { from: null, to: 'x' },
    });
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
