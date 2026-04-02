import type { Express } from 'express';
import { CosmeticsService } from '../services/cosmetics.service';
interface RegisterCosmeticsRoutesOptions {
    app: Express;
    cosmeticsService: CosmeticsService;
}
export declare function registerCosmeticsRoutes({ app, cosmeticsService, }: RegisterCosmeticsRoutesOptions): void;
export {};
//# sourceMappingURL=cosmetics.routes.d.ts.map