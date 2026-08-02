"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const { db: legacyDb } = require('./init');
exports.db = legacyDb;
exports.default = exports.db;
