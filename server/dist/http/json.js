"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonReplacer = void 0;
exports.sendJson = sendJson;
const jsonReplacer = (_key, value) => typeof value === 'bigint' ? value.toString() : value;
exports.jsonReplacer = jsonReplacer;
function sendJson(res, data) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, exports.jsonReplacer));
}
//# sourceMappingURL=json.js.map