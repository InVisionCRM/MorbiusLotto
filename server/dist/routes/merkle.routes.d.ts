import type { Express } from 'express';
import { MerkleDropsLPService } from '../services/merkle-lp-drops.service';
import { MerkleDropsService } from '../services/merkle-drops.service';
interface RegisterMerkleReadRoutesOptions {
    app: Express;
    merkleDropsService: MerkleDropsService;
    merkleDropsLPService: MerkleDropsLPService;
}
export declare function registerMerkleReadRoutes({ app, merkleDropsService, merkleDropsLPService, }: RegisterMerkleReadRoutesOptions): void;
export {};
//# sourceMappingURL=merkle.routes.d.ts.map