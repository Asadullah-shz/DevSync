import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { db } from '../../database/db.js';
import crypto from 'crypto';


passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await db.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

const getCallbackUrl = (provider: string) => {
  const baseUrl = process.env.SSO_CALLBACK_URL || 'http://localhost:3000/api/v1/auth';
  return `${baseUrl}/${provider}/callback`;
};

const handleSSO = async (
  accessToken: string,
  refreshToken: string,
  profile: any,
  done: any
) => {
  try {
    const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
    if (!email) {
      return done(new Error('No email found from SSO provider'), null);
    }

    let user = await db.user.findUnique({ where: { email } });

    if (user) {
      // If user exists, link SSO account if not already linked
      if (!user.ssoProvider) {
        user = await db.user.update({
          where: { email },
          data: {
            ssoProvider: profile.provider,
            ssoId: profile.id,
          },
        });
      }
    } else {
      // Create new user
      user = await db.user.create({
        data: {
          id: `USR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          email,
          name: profile.displayName || profile.username || 'Unknown',
          ssoProvider: profile.provider,
          ssoId: profile.id,
        },
      });
    }

    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
};

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: getCallbackUrl('github'),
        scope: ['user:email'],
      },
      handleSSO
    )
  );
  console.log('[Auth] GitHub SSO Enabled');
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: getCallbackUrl('google'),
        scope: ['profile', 'email'],
      },
      handleSSO
    )
  );
  console.log('[Auth] Google SSO Enabled');
}

export default passport;
