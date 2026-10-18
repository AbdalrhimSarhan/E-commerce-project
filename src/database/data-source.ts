import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { buildTypeOrmOptions } from './typeorm.config';

/**
 * DataSource for the TypeORM CLI (migrations). The CLI runs outside Nest, so
 * the environment is validated here the same way the app validates it.
 * The app itself never imports this file; it uses DatabaseModule.
 */
export default new DataSource(buildTypeOrmOptions(validateEnv(process.env)));
