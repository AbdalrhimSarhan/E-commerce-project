import {
  Injectable,
  type NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { API_KEY_HEADER } from '../../../common/swagger/setup-swagger';
import {
  INVALID_CREDENTIALS_MESSAGE,
  PrincipalResolver,
} from '../services/principal-resolver.service';

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9\-_.]+)$/i;

/**
 * Runs on every route. Its ONLY job is to answer "who are you?":
 * - no credentials: continue without req.user (the guards decide later)
 * - both a bearer token and an API key: 401 (ambiguous)
 * - credentials present: valid -> req.user is set, invalid -> 401
 * It never decides permissions; that is the guards' job.
 */
@Injectable()
export class AuthenticationMiddleware implements NestMiddleware {
  constructor(private readonly resolver: PrincipalResolver) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authorization = req.header('authorization');
    const apiKey = req.header(API_KEY_HEADER);

    if (authorization === undefined && apiKey === undefined) {
      next();
      return;
    }

    if (authorization !== undefined && apiKey !== undefined) {
      throw new UnauthorizedException(
        'Send either a bearer token or an API key, not both',
      );
    }

    if (authorization !== undefined) {
      const match = BEARER_PATTERN.exec(authorization.trim());
      if (!match) {
        // Present but unusable (e.g. "Basic ...") counts as invalid credentials.
        throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
      }
      req.user = await this.resolver.fromAccessToken(match[1]);
    } else {
      req.user = await this.resolver.fromApiKey((apiKey ?? '').trim());
    }

    next();
  }
}
