import type { Express } from 'express';
import multer from 'multer';
export declare function configureCoreMiddleware(app: Express): void;
export declare function createUploadMulter(): multer.Multer;
export declare function requireAdminSecret(app: Express, adminSecret: string | undefined): void;
//# sourceMappingURL=app-setup.d.ts.map