import type { Express } from 'express';
import { MerkleDropsLPService } from '../services/merkle-lp-drops.service';
import { MerkleDropsService } from '../services/merkle-drops.service';
interface RegisterMerkleAdminReadRoutesOptions {
    app: Express;
    merkleDropsService: MerkleDropsService;
    merkleDropsLPService: MerkleDropsLPService;
}
export declare function registerMerkleAdminReadRoutes({ app, merkleDropsService, merkleDropsLPService, }: RegisterMerkleAdminReadRoutesOptions): void;
export {};
//# sourceMappingURL=merkle-admin-read.routes.d.ts.map