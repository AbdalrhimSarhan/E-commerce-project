import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { ErrorDetail } from '../envelope/envelope.types';

/** Thrown by the global ValidationPipe; the filter turns `details` into error.details. */
export class ValidationException extends BadRequestException {
  constructor(readonly details: ErrorDetail[]) {
    super('Validation failed');
  }
}

/**
 * Flattens class-validator errors into `{ field, message }` items. Nested
 * properties get a dotted path, e.g. `items.0.price`.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    const nested = flattenValidationErrors(error.children ?? [], field);
    return [...own, ...nested];
  });
}
