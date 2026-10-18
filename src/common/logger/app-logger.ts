import { ConsoleLogger } from '@nestjs/common';
import { getRequestId } from '../context/request-context';

/**
 * Nest's console logger, plus the current request id on every line written
 * while handling a request, e.g. `[HealthController] [rid:3f2c...]`.
 */
export class AppLogger extends ConsoleLogger {
  protected formatContext(context: string): string {
    const formatted = super.formatContext(context);
    const requestId = getRequestId();
    if (requestId === undefined) {
      return formatted;
    }
    return `${formatted}${this.colorize(`[rid:${requestId}] `, 'verbose')}`;
  }
}
