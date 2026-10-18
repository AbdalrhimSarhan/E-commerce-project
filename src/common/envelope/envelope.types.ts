import { ErrorCode } from '../constants/error-codes';

export interface RequestMeta {
  requestId: string;
  timestamp: string;
}

export interface PaginationMeta extends RequestMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ErrorMeta extends RequestMeta {
  path: string;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: RequestMeta | PaginationMeta;
}

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
}

export interface ErrorEnvelope {
  success: false;
  error: ErrorBody;
  meta: ErrorMeta;
}
