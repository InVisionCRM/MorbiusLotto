import type { Express } from 'express';
import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';

const DEFAULT_ORIGINS = ['https://morbius.io'];
const ALLOWED_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO = ['video/mp4', 'video/webm'];
const MAX_SIZE_VIDEO = 50 * 1024 * 1024;

export function configureCoreMiddleware(app: Express): void {
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

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
  }));

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
      if (/^https:\/\/morbiuslotto(-[a-z0-9]+)*\.vercel\.app$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }));

  app.use('/api/', rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 1000,
    message: 'Too many requests from this IP, please try again later.',
    validate: {
      xForwardedForHeader: false,
    },
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const uploadsDir = path.join(process.cwd(), 'uploads');
  const brandedTableDir = path.join(uploadsDir, 'BlackJack', 'BrandedTable');
  const videoTableDir = path.join(uploadsDir, 'BlackJack', 'video table');

  [brandedTableDir, videoTableDir].forEach((dir) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Ignore missing permissions in readonly environments.
    }
  });

  app.use('/uploads', express.static(uploadsDir, {
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
}

export function createUploadMulter() {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const brandedTableDir = path.join(uploadsDir, 'BlackJack', 'BrandedTable');
  const videoTableDir = path.join(uploadsDir, 'BlackJack', 'video table');

  return multer({
    storage: multer.diskStorage({
      destination: (_req, file, cb) => {
        const kind = (file.mimetype || '').startsWith('video/') ? 'video' : 'image';
        cb(null, kind === 'video' ? videoTableDir : brandedTableDir);
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || (file.mimetype?.startsWith('video/') ? '.mp4' : '.png');
        const base = path.basename(file.originalname, path.extname(file.originalname));
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

export function requireAdminSecret(app: Express, adminSecret: string | undefined): void {
  app.use('/api/admin', (req, res, next) => {
    if (!adminSecret) {
      res.status(503).json({ error: 'Admin access not configured on server' });
      return;
    }

    const secret = (req.headers['x-admin-secret'] as string | undefined)?.trim();
    if (!secret || secret !== adminSecret) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  });
}
