export const __esModule: boolean;
export class WebSocketService {
    static POKER_AVATAR_EMOTIONS: Set<string>;
    constructor(server: any, gameService: any, dbService: any, tournamentService: any, pokerGameService: any, bjMultiService: any);
    gameService: any;
    dbService: any;
    wss: ws_1.Server<typeof ws_1, typeof import("http").IncomingMessage>;
    clients: Map<any, any>;
    roomToClients: Map<any, any>;
    chatMessageTimestampsByAddress: Map<any, any>;
    heartbeatInterval: NodeJS.Timeout;
    chatRateLimitCleanupInterval: NodeJS.Timeout;
    pokerAutoFoldInterval: null;
    pokerServerBotInterval: null;
    publicClient: {
        account: undefined;
        batch?: {
            multicall?: boolean | import("viem/_types/types/utils").Prettify<viem_1.MulticallBatchOptions> | undefined;
        } | undefined;
        cacheTime: number;
        chain: viem_1.Chain | undefined;
        key: string;
        name: string;
        pollingInterval: number;
        request: viem_1.EIP1193RequestFn<viem_1.PublicRpcSchema>;
        transport: viem_1.TransportConfig<string, viem_1.EIP1193RequestFn> & Record<string, any>;
        type: string;
        uid: string;
        call: (parameters: viem_1.CallParameters<viem_1.Chain | undefined>) => Promise<viem_1.CallReturnType>;
        createBlockFilter: () => Promise<viem_1.CreateBlockFilterReturnType>;
        createContractEventFilter: <const TAbi extends viem_1.Abi | readonly unknown[], TEventName extends string | undefined, TArgs extends import("viem/_types/types/contract").MaybeExtractEventArgsFromAbi<TAbi, TEventName> | undefined, TStrict extends boolean | undefined = undefined, TFromBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined, TToBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined>(args: viem_1.CreateContractEventFilterParameters<TAbi, TEventName, TArgs, TStrict, TFromBlock, TToBlock>) => Promise<viem_1.CreateContractEventFilterReturnType<TAbi, TEventName, TArgs, TStrict, TFromBlock, TToBlock>>;
        createEventFilter: <const TAbiEvent extends import("abitype").AbiEvent | undefined = undefined, const TAbiEvents extends readonly import("abitype").AbiEvent[] | readonly unknown[] | undefined = TAbiEvent extends import("abitype").AbiEvent ? [TAbiEvent] : undefined, TStrict extends boolean | undefined = undefined, TFromBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined, TToBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined, _EventName extends string | undefined = import("viem/_types/types/contract").MaybeAbiEventName<TAbiEvent>, _Args extends import("viem/_types/types/contract").MaybeExtractEventArgsFromAbi<TAbiEvents, _EventName> | undefined = undefined>(args?: viem_1.CreateEventFilterParameters<TAbiEvent, TAbiEvents, TStrict, TFromBlock, TToBlock, _EventName, _Args>) => Promise<viem_1.CreateEventFilterReturnType<TAbiEvent, TAbiEvents, TStrict, TFromBlock, TToBlock, _EventName, _Args>>;
        createPendingTransactionFilter: () => Promise<viem_1.CreatePendingTransactionFilterReturnType>;
        estimateContractGas: <TChain extends viem_1.Chain | undefined, const TAbi extends viem_1.Abi | readonly unknown[], TFunctionName extends string>(args: viem_1.EstimateContractGasParameters<TAbi, TFunctionName, TChain, viem_1.Account | undefined>) => Promise<viem_1.EstimateContractGasReturnType>;
        estimateGas: (args: viem_1.EstimateGasParameters<viem_1.Chain | undefined, viem_1.Account | undefined>) => Promise<viem_1.EstimateGasReturnType>;
        getBalance: (args: viem_1.GetBalanceParameters) => Promise<viem_1.GetBalanceReturnType>;
        getBlock: <TIncludeTransactions extends boolean = false, TBlockTag extends viem_1.BlockTag = "latest">(args?: viem_1.GetBlockParameters<TIncludeTransactions, TBlockTag> | undefined) => Promise<viem_1.GetBlockReturnType<viem_1.Chain | undefined, TIncludeTransactions, TBlockTag>>;
        getBlockNumber: (args?: viem_1.GetBlockNumberParameters) => Promise<viem_1.GetBlockNumberReturnType>;
        getBlockTransactionCount: (args?: viem_1.GetBlockTransactionCountParameters) => Promise<viem_1.GetBlockTransactionCountReturnType>;
        getBytecode: (args: viem_1.GetBytecodeParameters) => Promise<viem_1.GetBytecodeReturnType>;
        getChainId: () => Promise<viem_1.GetChainIdReturnType>;
        getContractEvents: <const TAbi extends viem_1.Abi | readonly unknown[], TEventName extends string | undefined = undefined, TStrict extends boolean | undefined = undefined, TFromBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined, TToBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined>(args: import("viem/_types/actions/public/getContractEvents").GetContractEventsParameters<TAbi, TEventName, TStrict, TFromBlock, TToBlock>) => Promise<import("viem/_types/actions/public/getContractEvents").GetContractEventsReturnType<TAbi, TEventName, TStrict, TFromBlock, TToBlock>>;
        getEnsAddress: (args: viem_1.GetEnsAddressParameters) => Promise<viem_1.GetEnsAddressReturnType>;
        getEnsAvatar: (args: import("viem/_types/actions/ens/getEnsAvatar").GetEnsAvatarParameters) => Promise<import("viem/_types/actions/ens/getEnsAvatar").GetEnsAvatarReturnType>;
        getEnsName: (args: viem_1.GetEnsNameParameters) => Promise<viem_1.GetEnsNameReturnType>;
        getEnsResolver: (args: viem_1.GetEnsResolverParameters) => Promise<viem_1.GetEnsResolverReturnType>;
        getEnsText: (args: import("viem/_types/actions/ens/getEnsText").GetEnsTextParameters) => Promise<import("viem/_types/actions/ens/getEnsText").GetEnsTextReturnType>;
        getFeeHistory: (args: viem_1.GetFeeHistoryParameters) => Promise<viem_1.GetFeeHistoryReturnType>;
        estimateFeesPerGas: <TChainOverride extends viem_1.Chain | undefined = undefined, TType extends viem_1.FeeValuesType = "eip1559">(args?: viem_1.EstimateFeesPerGasParameters<viem_1.Chain | undefined, TChainOverride, TType> | undefined) => Promise<viem_1.EstimateFeesPerGasReturnType>;
        getFilterChanges: <TFilterType extends import("viem/_types/types/filter").FilterType, const TAbi extends viem_1.Abi | readonly unknown[] | undefined, TEventName extends string | undefined, TStrict extends boolean | undefined = undefined, TFromBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined, TToBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined>(args: viem_1.GetFilterChangesParameters<TFilterType, TAbi, TEventName, TStrict, TFromBlock, TToBlock>) => Promise<viem_1.GetFilterChangesReturnType<TFilterType, TAbi, TEventName, TStrict, TFromBlock, TToBlock>>;
        getFilterLogs: <const TAbi extends viem_1.Abi | readonly unknown[] | undefined, TEventName extends string | undefined, TStrict extends boolean | undefined = undefined, TFromBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined, TToBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined>(args: viem_1.GetFilterLogsParameters<TAbi, TEventName, TStrict, TFromBlock, TToBlock>) => Promise<viem_1.GetFilterLogsReturnType<TAbi, TEventName, TStrict, TFromBlock, TToBlock>>;
        getGasPrice: () => Promise<viem_1.GetGasPriceReturnType>;
        getLogs: <const TAbiEvent extends import("abitype").AbiEvent | undefined = undefined, const TAbiEvents extends readonly import("abitype").AbiEvent[] | readonly unknown[] | undefined = TAbiEvent extends import("abitype").AbiEvent ? [TAbiEvent] : undefined, TStrict extends boolean | undefined = undefined, TFromBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined, TToBlock extends viem_1.BlockNumber | viem_1.BlockTag | undefined = undefined>(args?: viem_1.GetLogsParameters<TAbiEvent, TAbiEvents, TStrict, TFromBlock, TToBlock>) => Promise<viem_1.GetLogsReturnType<TAbiEvent, TAbiEvents, TStrict, TFromBlock, TToBlock>>;
        getProof: (args: import("viem/_types/actions/public/getProof").GetProofParameters) => Promise<import("viem/_types/actions/public/getProof").GetProofReturnType>;
        estimateMaxPriorityFeePerGas: <TChainOverride extends viem_1.Chain | undefined = undefined>(args?: {
            chain: TChainOverride | null;
        } | undefined) => Promise<viem_1.EstimateMaxPriorityFeePerGasReturnType>;
        getStorageAt: (args: viem_1.GetStorageAtParameters) => Promise<viem_1.GetStorageAtReturnType>;
        getTransaction: <TBlockTag extends viem_1.BlockTag = "latest">(args: viem_1.GetTransactionParameters<TBlockTag>) => Promise<viem_1.GetTransactionReturnType<viem_1.Chain | undefined, TBlockTag>>;
        getTransactionConfirmations: (args: viem_1.GetTransactionConfirmationsParameters<viem_1.Chain | undefined>) => Promise<viem_1.GetTransactionConfirmationsReturnType>;
        getTransactionCount: (args: viem_1.GetTransactionCountParameters) => Promise<viem_1.GetTransactionCountReturnType>;
        getTransactionReceipt: (args: viem_1.GetTransactionReceiptParameters) => Promise<viem_1.TransactionReceipt>;
        multicall: <TContracts extends viem_1.ContractFunctionConfig[], TAllowFailure extends boolean = true>(args: viem_1.MulticallParameters<TContracts, TAllowFailure>) => Promise<viem_1.MulticallReturnType<TContracts, TAllowFailure>>;
        prepareTransactionRequest: <TChainOverride extends viem_1.Chain | undefined = undefined>(args: viem_1.PrepareTransactionRequestParameters<viem_1.Chain | undefined, viem_1.Account | undefined, TChainOverride>) => Promise<viem_1.PrepareTransactionRequestReturnType>;
        readContract: <const TAbi extends viem_1.Abi | readonly unknown[], TFunctionName extends string>(args: viem_1.ReadContractParameters<TAbi, TFunctionName>) => Promise<viem_1.ReadContractReturnType<TAbi, TFunctionName>>;
        sendRawTransaction: (args: import("viem/_types/actions/wallet/sendRawTransaction").SendRawTransactionParameters) => Promise<import("viem/_types/actions/wallet/sendRawTransaction").SendRawTransactionReturnType>;
        simulateContract: <const TAbi extends viem_1.Abi | readonly unknown[], TFunctionName extends string, TChainOverride extends viem_1.Chain | undefined = undefined>(args: viem_1.SimulateContractParameters<TAbi, TFunctionName, viem_1.Chain | undefined, TChainOverride>) => Promise<viem_1.SimulateContractReturnType<TAbi, TFunctionName, viem_1.Chain | undefined, TChainOverride>>;
        verifyMessage: (args: import("viem/_types/actions/public/verifyMessage").VerifyMessageParameters) => Promise<import("viem/_types/actions/public/verifyMessage").VerifyMessageReturnType>;
        verifyTypedData: (args: import("viem/_types/actions/public/verifyTypedData").VerifyTypedDataParameters) => Promise<import("viem/_types/actions/public/verifyTypedData").VerifyTypedDataReturnType>;
        uninstallFilter: (args: viem_1.UninstallFilterParameters) => Promise<viem_1.UninstallFilterReturnType>;
        waitForTransactionReceipt: (args: viem_1.WaitForTransactionReceiptParameters<viem_1.Chain | undefined>) => Promise<viem_1.TransactionReceipt>;
        watchBlockNumber: (args: viem_1.WatchBlockNumberParameters) => viem_1.WatchBlockNumberReturnType;
        watchBlocks: <TIncludeTransactions extends boolean = false, TBlockTag extends viem_1.BlockTag = "latest">(args: viem_1.WatchBlocksParameters<viem_1.Transport, viem_1.Chain | undefined, TIncludeTransactions, TBlockTag>) => viem_1.WatchBlocksReturnType;
        watchContractEvent: <const TAbi extends viem_1.Abi | readonly unknown[], TEventName extends string, TStrict extends boolean | undefined = undefined>(args: viem_1.WatchContractEventParameters<TAbi, TEventName, TStrict>) => viem_1.WatchContractEventReturnType;
        watchEvent: <const TAbiEvent extends import("abitype").AbiEvent | undefined = undefined, const TAbiEvents extends readonly import("abitype").AbiEvent[] | readonly unknown[] | undefined = TAbiEvent extends import("abitype").AbiEvent ? [TAbiEvent] : undefined, TStrict extends boolean | undefined = undefined>(args: viem_1.WatchEventParameters<TAbiEvent, TAbiEvents, TStrict>) => viem_1.WatchEventReturnType;
        watchPendingTransactions: (args: viem_1.WatchPendingTransactionsParameters<viem_1.Transport>) => viem_1.WatchPendingTransactionsReturnType;
        extend: <const client extends {
            [x: string]: unknown;
            account?: undefined;
            batch?: undefined;
            cacheTime?: undefined;
            chain?: undefined;
            key?: undefined;
            name?: undefined;
            pollingInterval?: undefined;
            request?: undefined;
            transport?: undefined;
            type?: undefined;
            uid?: undefined;
        } & Partial<Pick<viem_1.PublicActions, "call" | "createContractEventFilter" | "createEventFilter" | "estimateContractGas" | "estimateGas" | "getBlock" | "getBlockNumber" | "getChainId" | "getContractEvents" | "getEnsText" | "getFilterChanges" | "getGasPrice" | "getLogs" | "getTransaction" | "getTransactionCount" | "getTransactionReceipt" | "prepareTransactionRequest" | "readContract" | "sendRawTransaction" | "simulateContract" | "uninstallFilter" | "watchBlockNumber" | "watchContractEvent"> & Pick<viem_1.WalletActions, "sendTransaction" | "writeContract">>>(fn: (client: viem_1.Client<viem_1.Transport, viem_1.Chain | undefined, undefined, viem_1.PublicRpcSchema, viem_1.PublicActions<viem_1.Transport, viem_1.Chain | undefined>>) => client) => viem_1.Client<viem_1.Transport, viem_1.Chain | undefined, undefined, viem_1.PublicRpcSchema, { [K in keyof client]: client[K]; } & viem_1.PublicActions<viem_1.Transport, viem_1.Chain | undefined>>;
    };
    contractAddress: `0x${string}`;
    tournamentService: any;
    pokerGameService: null;
    pokerTournamentService: null;
    bjMultiService: null;
    bjMultiTimerInterval: null;
    bjMultiActionTimestamps: Map<any, any>;
    betLimitsCache: null;
    /** Wire in the PokerTournamentService after construction. */
    setPokerTournamentService(service: any): void;
    /** Prune addresses with no timestamps in the current window to avoid unbounded map growth. */
    cleanupChatRateLimitMap(): void;
    /** Resolve Blackjack min/max bet from admin config (cached). Uses defaults if missing/invalid. */
    getBetLimits(): Promise<{
        minBet: any;
        maxBet: any;
    }>;
    /** Returns false if over per-address limit; otherwise records the message and returns true. */
    checkPerAddressChatLimit(address: any, now: any): boolean;
    handleConnection(ws: any, request: any): Promise<void>;
    handleMessage(ws: any, data: any): Promise<void>;
    routeAuthMessage(ws: any, message: any): Promise<void>;
    routePublicMessage(ws: any, message: any): Promise<void>;
    routeBlackjackMessage(ws: any, message: any): Promise<void>;
    routeChatMessage(ws: any, message: any): Promise<void>;
    routeTournamentMessage(ws: any, message: any): Promise<void>;
    routePokerMessage(ws: any, message: any): Promise<void>;
    routeBJMultiMessage(ws: any, message: any): Promise<void>;
    dispatchDomainMessage(ws: any, message: any, handlerMap: any, domainName: any): Promise<void>;
    handlePing(ws: any, message: any): Promise<void>;
    /**
     * Check if client is authenticated. If not, send error and return false.
     * In grace period (REQUIRE_WS_AUTH=false), accepts legacy query-param auth.
     */
    requireAuth(ws: any, message: any): boolean;
    /**
     * Handle EIP-712 auth response from client.
     * Client signs the nonce we sent in auth_challenge to prove wallet ownership.
     */
    handleAuthResponse(ws: any, message: any): Promise<void>;
    handleGetServerSeedHash(ws: any, message: any): Promise<void>;
    handleCreateGame(ws: any, message: any): Promise<void>;
    handlePlayerAction(ws: any, message: any): Promise<void>;
    /**
     * Resolve any pending withdrawals for a player by checking on-chain nonce usage.
     * If the nonce was used (withdrawal succeeded on-chain), marks it completed (no refund).
     * If the nonce was NOT used, leaves it pending for the expiry cron to refund.
     */
    resolvePendingWithdrawals(playerAddress: any): Promise<void>;
    handleSyncBalance(ws: any, message: any): Promise<void>;
    handleGetBalance(ws: any, message: any): Promise<void>;
    handleGetGameState(ws: any, message: any): Promise<void>;
    handleJoinRoom(ws: any, message: any): Promise<void>;
    handlePokerListTables(ws: any, message: any): Promise<void>;
    handlePokerJoinTable(ws: any, message: any): Promise<void>;
    handlePokerLeaveTable(ws: any, message: any): Promise<void>;
    handlePokerAddChips(ws: any, message: any): Promise<void>;
    handlePokerAction(ws: any, message: any): Promise<void>;
    handlePokerGetState(ws: any, message: any): Promise<void>;
    handlePokerQuickReaction(ws: any, message: any): Promise<void>;
    handlePokerAvatarEmotion(ws: any, message: any): Promise<void>;
    handlePokerCreateTable(ws: any, message: any): Promise<void>;
    handlePokerUpdateTableLogo(ws: any, message: any): Promise<void>;
    handleGetChatHistory(ws: any, message: any): Promise<void>;
    handleSetDisplayName(ws: any, message: any): Promise<void>;
    handleGetProfile(ws: any, message: any): Promise<void>;
    handleChatMessage(ws: any, message: any): Promise<void>;
    sendMessage(ws: any, message: any): void;
    sendError(ws: any, error: any, requestId: any): void;
    broadcastToPlayer(playerAddress: any, message: any): void;
    broadcastToAll(message: any): void;
    broadcastToRoom(roomId: any, message: any): void;
    /** Called by admin API when a message is soft-deleted; notifies all clients in the room. */
    broadcastChatMessageDeleted(roomId: any, messageId: any): void;
    /** Broadcast current poker table state to room (e.g. after API adds bots so UI updates). */
    broadcastPokerTableState(tableId: any): Promise<void>;
    handlePokerTournamentList(ws: any, message: any): Promise<void>;
    handlePokerTournamentCreate(ws: any, message: any): Promise<void>;
    handlePokerTournamentJoin(ws: any, message: any): Promise<void>;
    handlePokerTournamentGetState(ws: any, message: any): Promise<void>;
    handlePokerTournamentRegistrants(ws: any, message: any): Promise<void>;
    handlePokerTournamentCancel(ws: any, message: any): Promise<void>;
    getConnectionCount(): number;
    getActivePlayersCount(): Promise<number>;
    /**
     * WebSocket clients currently in each game’s rooms (chat + table rooms).
     * One browser tab ≈ one connection; not deduped by wallet.
     */
    getLivePresenceByGame(): {
        poker: number;
        blackjackMulti: number;
        blackjack: any;
        plinko: any;
        keno: any;
        lottery: any;
        bigWheel: any;
    };
    handleCheckExclusionStatus(ws: any, message: any): Promise<void>;
    handleSetExclusion(ws: any, message: any): Promise<void>;
    handleGetExclusionHistory(ws: any, message: any): Promise<void>;
    isPlayerExcluded(playerAddress: any): Promise<any>;
    handleTournamentEnter(ws: any, message: any): Promise<void>;
    handleTournamentLeave(ws: any, message: any): Promise<void>;
    handleGetTournamentState(ws: any, message: any): Promise<void>;
    handleTournamentGameStart(ws: any, message: any): Promise<void>;
    handleTournamentPlayerAction(ws: any, message: any): Promise<void>;
    handleTournamentLeaderboard(ws: any, message: any): Promise<void>;
    handleTournamentLeaderboardById(ws: any, message: any): Promise<void>;
    handleGetTournamentInfo(ws: any, message: any): Promise<void>;
    broadcastTournamentLeaderboardUpdate(tournamentId: any): Promise<void>;
    handleTournamentCreate(ws: any, message: any): Promise<void>;
    handleCreateFreeroll(ws: any, message: any): Promise<void>;
    handleTournamentList(ws: any, message: any): Promise<void>;
    handleTournamentJoin(ws: any, message: any): Promise<void>;
    handleTournamentUnregister(ws: any, message: any): Promise<void>;
    handleTournamentGetInfo(ws: any, message: any): Promise<void>;
    handleFreerollList(ws: any, message: any): Promise<void>;
    handleFreerollRegister(ws: any, message: any): Promise<void>;
    handleFreerollJoin(ws: any, message: any): Promise<void>;
    handleTournamentEntriesList(ws: any, message: any): Promise<void>;
    handleCreatorTournaments(ws: any, message: any): Promise<void>;
    handleCreatorEarnings(ws: any, message: any): Promise<void>;
    handleTournamentCancel(ws: any, message: any): Promise<void>;
    handleTournamentReclaim(ws: any, message: any): Promise<void>;
    handleRecentGlobalWins(ws: any, message: any): Promise<void>;
    getPrizePercentagesForType(type: any): number[];
    shutdown(): void;
    /** Broadcast current BJ multi table state to room. */
    broadcastBJMultiTableState(tableId: any): Promise<void>;
    /** Timer tick: check for expired turns and betting timeouts across all active BJ multi tables. */
    tickBJMultiTimers(): Promise<void>;
    handleBJMultiListTables(ws: any, message: any): Promise<void>;
    handleBJMultiJoinTable(ws: any, message: any): Promise<void>;
    handleBJMultiLeaveTable(ws: any, message: any): Promise<void>;
    handleBJMultiPlaceBet(ws: any, message: any): Promise<void>;
    handleBJMultiAction(ws: any, message: any): Promise<void>;
    handleBJMultiGetState(ws: any, message: any): Promise<void>;
    handleBJMultiTipDealer(ws: any, message: any): Promise<void>;
    /**
     * Generic tip dealer — works from any game page (solo blackjack, poker, etc.)
     * Deducts from player balance and credits the deployer wallet.
     */
    handleGenericTipDealer(ws: any, message: any): Promise<void>;
    handleBJMultiTableHistory(ws: any, message: any): Promise<void>;
    /** Auto-stand a disconnected player if it's currently their turn. */
    handleBJMultiDisconnect(tableId: any, playerAddress: any): Promise<void>;
    handleBJMultiCreateTable(ws: any, message: any): Promise<void>;
    handleBJMultiDeleteTable(ws: any, message: any): Promise<void>;
    handleBJMultiQuickReaction(ws: any, message: any): Promise<void>;
    handleBJMultiAvatarEmotion(ws: any, message: any): Promise<void>;
}
import ws_1 = require("ws");
import viem_1 = require("viem");
//# sourceMappingURL=websocket.service.impl.d.ts.map