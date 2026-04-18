"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureCoreMiddleware = configureCoreMiddleware;
exports.createUploadMulter = createUploadMulter;
exports.requireAdminSecret = requireAdminSecret;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const multer_1 = __importDefault(require("multer"));
const DEFAULT_ORIGINS = ['https://morbius.io'];
const ALLOWED_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO = ['video/mp4', 'video/webm'];
const MAX_SIZE_VIDEO = 50 * 1024 * 1024;
function configureCoreMiddleware(app) {
    const trustProxyEnv = (process.env.TRUST_PROXY || '').trim().toLowerCase();
    const trustProxyValue = trustProxyEnv === '0' || trustProxyEnv === 'false' ? 0 : 1;
    app.set('trust proxy', trustProxyValue);
    console.log(`[Server] Trust proxy setting: ${trustProxyValue} (TRUST_PROXY="${process.env.TRUST_PROXY || 'unset'}")`);
    if (trustProxyValue === 0) {
        console.warn('[Server] WARNING: Trust proxy is DISABLED - rate limiter will fail behind reverse proxy if X-Forwarded-For header is present.');
    }
    const envOrigins = (process.env.FRONTEND_URL || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    const allowedOrigins = [...new Set([...DEFAULT_ORIGINS, ...envOrigins])];
    app.use((0, helmet_1.default)({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        crossOriginOpenerPolicy: false,
    }));
    app.use((0, cors_1.default)({
        origin: (origin, cb) => {
            if (!origin)
                return cb(null, true);
            if (allowedOrigins.includes(origin))
                return cb(null, true);
            if (/^https?:\/\/localhost(:\d+)?$/.test(origin))
                return cb(null, true);
            if (/^https:\/\/morbiuslotto(-[a-z0-9]+)*\.vercel\.app$/.test(origin))
                return cb(null, true);
            return cb(null, false);
        },
        credentials: true,
    }));
    app.use('/api/', (0, express_rate_limit_1.default)({
        windowMs: 1 * 60 * 1000,
        max: 1000,
        message: 'Too many requests from this IP, please try again later.',
        validate: {
            xForwardedForHeader: false,
        },
    }));
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
    const uploadsDir = path_1.default.join(process.cwd(), 'uploads');
    const brandedTableDir = path_1.default.join(uploadsDir, 'BlackJack', 'BrandedTable');
    const videoTableDir = path_1.default.join(uploadsDir, 'BlackJack', 'video table');
    [brandedTableDir, videoTableDir].forEach((dir) => {
        try {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        catch {
            // Ignore missing permissions in readonly environments.
        }
    });
    app.use('/uploads', express_1.default.static(uploadsDir, {
        setHeaders: (res) => {
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
    }));
}
function createUploadMulter() {
    const uploadsDir = path_1.default.join(process.cwd(), 'uploads');
    const brandedTableDir = path_1.default.join(uploadsDir, 'BlackJack', 'BrandedTable');
    const videoTableDir = path_1.default.join(uploadsDir, 'BlackJack', 'video table');
    return (0, multer_1.default)({
        storage: multer_1.default.diskStorage({
            destination: (_req, file, cb) => {
                const kind = (file.mimetype || '').startsWith('video/') ? 'video' : 'image';
                cb(null, kind === 'video' ? videoTableDir : brandedTableDir);
            },
            filename: (_req, file, cb) => {
                const ext = path_1.default.extname(file.originalname) || (file.mimetype?.startsWith('video/') ? '.mp4' : '.png');
                const base = path_1.default.basename(file.originalname, path_1.default.extname(file.originalname));
                const safe = `${base.replace(/[^a-zA-Z0-9-_]/g, '_')}_${Date.now()}${ext}`;
                cb(null, safe);
            },
        }),
        limits: { fileSize: MAX_SIZE_VIDEO },
        fileFilter: (_req, file, cb) => {
            const allowed = file.mimetype?.startsWith('video/') ? ALLOWED_VIDEO : ALLOWED_IMAGE;
            if (!allowed.includes(file.mimetype || '')) {
                cb(new Error(`Invalid type. Allowed: ${allowed.join(', ')}`));
                return;
            }
            cb(null, true);
        },
    });
}
function requireAdminSecret(app, adminSecret) {
    app.use('/api/admin', (req, res, next) => {
        if (!adminSecret) {
            res.status(503).json({ error: 'Admin access not configured on server' });
            return;
        }
        const secret = req.headers['x-admin-secret']?.trim();
        if (!secret || secret !== adminSecret) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        next();
    });
}
//# sourceMappingURL=app-setup.js.map