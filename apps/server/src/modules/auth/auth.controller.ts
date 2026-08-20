import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../../database/db.js';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh_secret';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  deviceId: z.string().nullable().optional(),
});

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const existingUser = await db.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      return res.status(400).json({ error: { message: 'Email already in use' } });
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const id = `USR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const user = await db.user.create({
      data: {
        id,
        email: data.email,
        name: data.name,
        password: hashedPassword,
      }
    });

    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
};

export const ssoCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as any;
    if (!user) {
      return res.redirect('/login?error=sso_failed');
    }

    const deviceId = req.query.deviceId as string || 'SSO-DEVICE';

    const accessToken = jwt.sign({ userId: user.id, deviceId }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(40).toString('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await db.session.create({
      data: {
        id: `SES-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        userId: user.id,
        deviceId,
        token: refreshToken,
        expiresAt,
      }
    });

    // In a real application, you'd want to redirect back to the desktop app 
    // using a custom protocol URI like devsync://auth?access_token=...
    // For this implementation, we return JSON or a simple HTML page with the token.
    res.send(`
      <html>
        <body>
          <h1>SSO Login Successful</h1>
          <p>You can close this window and return to DevSync.</p>
          <script>
            // Send token to the desktop app or store it
            const tokenData = { accessToken: "${accessToken}", refreshToken: "${refreshToken}" };
            if (window.opener) {
              window.opener.postMessage({ type: 'sso_success', data: tokenData }, '*');
              window.close();
            } else {
              console.log(tokenData);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await db.user.findUnique({ where: { email: data.email } }) as any;
    if (!user || !user.password) {
      return res.status(401).json({ error: { message: 'Invalid credentials' } });
    }

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      return res.status(401).json({ error: { message: 'Invalid credentials' } });
    }

    const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });

    const sessionId = `SESS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await db.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        deviceId: data.deviceId || null,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    });

    res.json({ accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: { message: 'Refresh token required' } });

    const session = await db.session.findUnique({ where: { token: refreshToken } });
    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: { message: 'Invalid or expired refresh token' } });
    }

    const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as any;
    const newAccessToken = jwt.sign({ userId: decoded.userId }, JWT_SECRET, { expiresIn: '15m' });
    const newRefreshToken = jwt.sign({ userId: decoded.userId }, REFRESH_SECRET, { expiresIn: '7d' });

    await db.session.update({
      where: { id: session.id },
      data: {
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    });

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await db.session.deleteMany({ where: { token: refreshToken } });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const me = async (req: any, res: Response) => {
  res.json({ user: req.user });
};
