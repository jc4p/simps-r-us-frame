import { Errors, createClient } from '@farcaster/quick-auth';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

const client = createClient();

// Resolve information about the authenticated Farcaster user
async function resolveUser(fid, neynarClient) {
  const userInfo = await neynarClient.getUser(fid);
  
  return {
    fid,
    primaryAddress: userInfo?.primaryAddress,
    username: userInfo?.username,
    displayName: userInfo?.displayName,
    pfpUrl: userInfo?.pfpUrl,
    powerBadge: userInfo?.powerBadge || false
  };
}

export const quickAuthMiddleware = createMiddleware(async (c, next) => {
  const authorization = c.req.header('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing token' });
  }

  try {
    const payload = await client.verifyJwt({
      token: authorization.split(' ')[1],
      domain: c.env.HOSTNAME,
    });

    const user = await resolveUser(payload.sub, c.get('neynarClient'));
    c.set('user', user);
  } catch (e) {
    if (e instanceof Errors.InvalidTokenError) {
      console.info('Invalid token:', e.message);
      throw new HTTPException(401, { message: 'Invalid token' });
    }

    throw e;
  }

  await next();
});