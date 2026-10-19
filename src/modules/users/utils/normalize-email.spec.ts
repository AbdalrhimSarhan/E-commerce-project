import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it.each([
    ['Admin@Example.COM', 'admin@example.com'],
    ['  user@example.com\t', 'user@example.com'],
    ['agent@example.com', 'agent@example.com'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});
