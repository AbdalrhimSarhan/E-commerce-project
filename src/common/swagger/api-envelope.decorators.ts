import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import {
  ErrorEnvelopeDto,
  PaginationMetaDto,
  RequestMetaDto,
} from './envelope.dto';

interface ApiOkEnvelopeOptions {
  status?: number;
  description?: string;
  /** `data` is an array of the model. */
  isArray?: boolean;
  /** `data` is an array and `meta` carries pagination numbers. */
  paginated?: boolean;
}

/** Documents a success response as `{ success: true, data: <model>, meta }`. */
export function ApiOkEnvelope(
  model: Type<unknown>,
  options: ApiOkEnvelopeOptions = {},
): MethodDecorator & ClassDecorator {
  const { status = HttpStatus.OK, description, isArray, paginated } = options;
  const modelRef = { $ref: getSchemaPath(model) };
  const metaModel = paginated ? PaginationMetaDto : RequestMetaDto;

  return applyDecorators(
    ApiExtraModels(model, RequestMetaDto, PaginationMetaDto),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data:
            isArray || paginated
              ? { type: 'array', items: modelRef }
              : modelRef,
          meta: { $ref: getSchemaPath(metaModel) },
        },
      },
    }),
  );
}

const ERROR_DESCRIPTIONS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR: invalid input',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED: missing or invalid credentials',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN: not allowed for this role',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND: resource does not exist',
  [HttpStatus.CONFLICT]: 'CONFLICT: duplicate or related-resource conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS: rate limit exceeded',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR: unexpected server error',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE: a dependency is down',
};

/**
 * Documents error responses with the error envelope. 500 is always added,
 * because any endpoint can fail unexpectedly.
 */
export function ApiErrorEnvelopes(
  ...statuses: number[]
): MethodDecorator & ClassDecorator {
  const all = [...new Set([...statuses, HttpStatus.INTERNAL_SERVER_ERROR])];

  return applyDecorators(
    ApiExtraModels(ErrorEnvelopeDto),
    ...all.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status] ?? 'Error',
        type: ErrorEnvelopeDto,
      }),
    ),
  );
}
