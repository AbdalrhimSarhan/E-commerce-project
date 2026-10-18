import type { ValidationError } from 'class-validator';
import { flattenValidationErrors } from './validation.exception';

describe('flattenValidationErrors', () => {
  it('returns one item per failed constraint, with dotted paths for nested fields', () => {
    const errors: ValidationError[] = [
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email' },
        children: [],
      },
      {
        property: 'role',
        constraints: { whitelistValidation: 'property role should not exist' },
        children: [],
      },
      {
        property: 'address',
        children: [
          {
            property: 'city',
            constraints: {
              isString: 'city must be a string',
              isNotEmpty: 'city should not be empty',
            },
            children: [],
          },
        ],
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'email', message: 'email must be an email' },
      { field: 'role', message: 'property role should not exist' },
      { field: 'address.city', message: 'city must be a string' },
      { field: 'address.city', message: 'city should not be empty' },
    ]);
  });
});
