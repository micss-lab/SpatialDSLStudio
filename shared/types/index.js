"use strict";
// ===========================================
// Shared Types between Frontend and Backend
// ===========================================
// This file contains all the TypeScript interfaces
// that are shared between the frontend and backend.
// ===========================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpressionOperator = exports.ExpressionType = void 0;
// ============ Expression Types ============
var ExpressionType;
(function (ExpressionType) {
    ExpressionType["LITERAL"] = "LITERAL";
    ExpressionType["REFERENCE"] = "REFERENCE";
    ExpressionType["OPERATION"] = "OPERATION";
    ExpressionType["COMPOUND"] = "COMPOUND";
})(ExpressionType || (exports.ExpressionType = ExpressionType = {}));
var ExpressionOperator;
(function (ExpressionOperator) {
    ExpressionOperator["ADD"] = "ADD";
    ExpressionOperator["SUBTRACT"] = "SUBTRACT";
    ExpressionOperator["MULTIPLY"] = "MULTIPLY";
    ExpressionOperator["DIVIDE"] = "DIVIDE";
    ExpressionOperator["INCREMENT"] = "INCREMENT";
    ExpressionOperator["DECREMENT"] = "DECREMENT";
    ExpressionOperator["EQUALS"] = "EQUALS";
    ExpressionOperator["NOT_EQUALS"] = "NOT_EQUALS";
    ExpressionOperator["GREATER_THAN"] = "GREATER_THAN";
    ExpressionOperator["LESS_THAN"] = "LESS_THAN";
    ExpressionOperator["GREATER_EQUALS"] = "GREATER_EQUALS";
    ExpressionOperator["LESS_EQUALS"] = "LESS_EQUALS";
    ExpressionOperator["AND"] = "AND";
    ExpressionOperator["OR"] = "OR";
    ExpressionOperator["NOT"] = "NOT";
})(ExpressionOperator || (exports.ExpressionOperator = ExpressionOperator = {}));
//# sourceMappingURL=index.js.map