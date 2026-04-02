import type { Server as HttpServer } from 'http';
import { logger } from '../utils/logger';

const PG_POOL_DOUBLE_RELEASE_MSG = 'Release called on client which has already been released to the pool';

export function registerProcessHooks(server: HttpServer, stopRuntime: () => void): void {
  process.on('uncaughtException', (err) => {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes(PG_POOL_DOUBLE_RELEASE_MSG)) {
      logger.warn('pg-pool double-release (known race under load/disconnect) - ignoring', {
        stack: err instanceof Error ? err.stack : undefined,
      });
      return;
    }
    console.error('[FATAL] Uncaught exception - keeping server alive:', err);
    logger.error('Uncaught exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (message.includes(PG_POOL_DOUBLE_RELEASE_MSG)) {
      logger.warn('pg-pool double-release (unhandled rejection) - ignoring', {
        stack: reason instanceof Error ? reason.stack : undefined,
      });
      return;
    }
    console.error('[FATAL] Unhandled rejection - keeping server alive:', reason);
    logger.error('Unhandled rejection:', reason);
  });

  const shutdown = (signal: 'SIGTERM' | 'SIGINT') => {
    logger.info(`${signal} received, shutting down gracefully`);
    stopRuntime();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
