import type { Express } from 'express';
import { TournamentService } from '../services/tournament.service';
interface RegisterTournamentReadRoutesOptions {
    app: Express;
    tournamentService: TournamentService;
}
export declare function registerTournamentReadRoutes({ app, tournamentService, }: RegisterTournamentReadRoutesOptions): void;
interface RegisterTournamentMutationRoutesOptions {
    app: Express;
    tournamentService: TournamentService;
}
export declare function registerTournamentMutationRoutes({ app, tournamentService, }: RegisterTournamentMutationRoutesOptions): void;
export {};
//# sourceMappingURL=tournament.routes.d.ts.map