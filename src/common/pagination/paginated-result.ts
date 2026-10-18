/**
 * Return this from a controller for a paginated list. The envelope interceptor
 * puts `items` into `data` and the numbers into `meta`.
 */
export class PaginatedResult<T> {
  constructor(
    readonly items: T[],
    readonly total: number,
    readonly page: number,
    readonly limit: number,
  ) {}

  get totalPages(): number {
    return this.limit > 0 ? Math.ceil(this.total / this.limit) : 0;
  }
}
