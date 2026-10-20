import {
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  type DemoProduct,
  validateDemoCatalog,
} from './demo-catalog';

describe('demo catalog data', () => {
  it('passes the API validation rules (DTOs, unique SKUs and names, known categories)', () => {
    expect(() => validateDemoCatalog()).not.toThrow();
  });

  it('has about 20 products and 8 categories', () => {
    expect(DEMO_PRODUCTS).toHaveLength(20);
    expect(DEMO_CATEGORIES).toHaveLength(8);
  });

  it('shows the many-to-many relationship', () => {
    const linkCounts = DEMO_PRODUCTS.map(
      (product) => product.categories.length,
    );

    // several products in 2 or 3 categories, never more than 3
    expect(
      linkCounts.filter((count) => count >= 2).length,
    ).toBeGreaterThanOrEqual(5);
    expect(linkCounts.some((count) => count === 3)).toBe(true);
    expect(Math.max(...linkCounts)).toBeLessThanOrEqual(3);
    // a few products without a category
    expect(
      linkCounts.filter((count) => count === 0).length,
    ).toBeGreaterThanOrEqual(2);

    // exactly one category with no products
    const used = new Set(
      DEMO_PRODUCTS.flatMap((product) => product.categories),
    );
    expect(
      DEMO_CATEGORIES.filter((category) => !used.has(category.name)).map(
        (c) => c.name,
      ),
    ).toEqual(['Clearance']);
  });

  describe('validateDemoCatalog rejects bad data', () => {
    const product = (overrides: Partial<DemoProduct>): DemoProduct => ({
      sku: 'OK-1',
      name: 'Ok',
      description: 'Ok',
      price: '1.00',
      stock: 1,
      categories: [],
      ...overrides,
    });

    it.each([
      ['a price with 3 decimals', [product({ price: '1.999' })], /price/],
      ['a negative stock', [product({ stock: -1 })], /stock/],
      ['a bad SKU', [product({ sku: 'bad sku!' })], /sku/],
      [
        'duplicate SKUs (case-insensitive)',
        [product({}), product({ sku: 'ok-1' })],
        /SKUs must be unique/,
      ],
      [
        'an unknown category',
        [product({ categories: ['Nope'] })],
        /unknown category "Nope"/,
      ],
    ])('%s', (_label, products, message) => {
      expect(() => validateDemoCatalog(DEMO_CATEGORIES, products)).toThrow(
        message,
      );
    });

    it('category names that differ only in case', () => {
      expect(() =>
        validateDemoCatalog(
          [
            { name: 'Audio', description: 'x' },
            { name: 'AUDIO', description: 'y' },
          ],
          [],
        ),
      ).toThrow(/case-insensitive/);
    });

    it('a name longer than the API allows', () => {
      expect(() =>
        validateDemoCatalog([{ name: 'x'.repeat(101), description: 'x' }], []),
      ).toThrow(/name/);
    });
  });
});
