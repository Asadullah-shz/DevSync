import { Router } from 'express';
import { register, login, refresh, logout, me, ssoCallback } from './auth.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import passport from 'passport';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authenticate, me);

// SSO Routes
router.get('/github', passport.authenticate('github', { scope: ['user:email'], session: false }));
router.get('/github/callback', passport.authenticate('github', { session: false, failureRedirect: '/login?error=sso_failed' }), ssoCallback);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login?error=sso_failed' }), ssoCallback);

export default router;
