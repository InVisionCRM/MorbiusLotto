"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.blackjackAbi = void 0;
/** Re-export from local copy (also available at contracts/abi/blackjack-v2.json) */
const blackjack_v2_json_1 = __importDefault(require("./blackjack-v2.json"));
const raw = blackjack_v2_json_1.default;
exports.blackjackAbi = Array.isArray(raw) ? raw : raw.abi;
//# sourceMappingURL=blackjack.js.map