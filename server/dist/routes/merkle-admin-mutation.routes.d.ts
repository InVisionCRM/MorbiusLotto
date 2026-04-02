import type { Express } from 'express';
import { MerkleDropsLPService } from '../services/merkle-lp-drops.service';
import { MerkleDropsService } from '../services/merkle-drops.service';
interface RegisterMerkleAdminMutationRoutesOptions {
    app: Express;
    merkleDropsService: MerkleDropsService;
    merkleDropsLPService: MerkleDropsLPService;
}
export declare function registerMerkleAdminMutationRoutes({ app, merkleDropsService, merkleDropsLPService, }: RegisterMerkleAdminMutationRoutesOptions): void;
export {};
//# sourceMappingURL=merkle-admin-mutation.routes.d.ts.map