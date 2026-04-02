"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProcessHooks = registerProcessHooks;
const logger_1 = require("../utils/logger");
const PG_POOL_DOUBLE_RELEASE_MSG = 'Release called on client which has already been released to the pool';
function registerProcessHooks(server, stopRuntime) {
    process.on('uncaughtException', (err) => {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes(PG_POOL_DOUBLE_RELEASE_MSG)) {
            logger_1.logger.warn('pg-pool double-release (known race under load/disconnect) - ignoring', {
                stack: err instanceof Error ? err.stack : undefined,
            });
            return;
        }
        console.error('[FATAL] Uncaught exception - keeping server alive:', err);
        logger_1.logger.error('Uncaught exception:', err);
    });
    process.on('unhandledRejection', (reason) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        if (message.includes(PG_POOL_DOUBLE_RELEASE_MSG)) {
            logger_1.logger.warn('pg-pool double-release (unhandled rejection) - ignoring', {
                stack: reason instanceof Error ? reason.stack : undefined,
            });
            return;
        }
        console.error('[FATAL] Unhandled rejection - keeping server alive:', reason);
        logger_1.logger.error('Unhandled rejection:', reason);
    });
    const shutdown = (signal) => {
        logger_1.logger.info(`${signal} received, shutting down gracefully`);
        stopRuntime();
        server.close(() => {
            logger_1.logger.info('Server closed');
            process.exit(0);
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
//# sourceMappingURL=process-hooks.js.map