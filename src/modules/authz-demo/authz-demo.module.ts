import { Module } from '@nestjs/common';
import { AuthzDemoController } from './authz-demo.controller';

/** TEMPORARY, development only (see AuthzDemoController). */
@Module({
  controllers: [AuthzDemoController],
})
export class AuthzDemoModule {}
