import type { FastifyInstance, RawServerDefault } from 'fastify';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';

/**
 * The server is built with an explicit pino instance, which makes its logger type
 * narrower than Fastify's default `FastifyBaseLogger`. Route registrars must use this
 * alias rather than the bare `FastifyInstance`, otherwise the two instance types are
 * structurally incompatible.
 */
export type AppServer = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  Logger
>;
