const jwt = require('jsonwebtoken');
const { findUserById, updateUserLastActive, isPlanExpired } = require('../db-service');

const JWT_SECRET = process.env.JWT_SECRET || 'cybersecpro_default_secret_change_in_production';
const DEFAULT_JWT = 'cybersecpro_default_secret_change_in_production';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT) {
  console.error('[SECURITY] CRITICAL: JWT_SECRET is not set in production! Set it in environment variables.');
}

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.id);
    if (!user)       return res.status(401).json({ error: 'User not found.' });
    if (user.banned) return res.status(403).json({ error: 'Account banned.' });

    // Check plan expiry (skip for admin).
    // Whitelist account-management routes so expired users can still:
    //   • view their profile/status  • request an upgrade  • chat with admin
    if (user.role !== 'admin' && isPlanExpired(user)) {
      const ALLOWED_EXPIRED = [
        '/upgrade-request', '/profile', '/stats', '/chat', '/license-key',
      ];
      const url = req.path || req.url || '';
      const isAllowed = ALLOWED_EXPIRED.some(p => url.includes(p));
      if (!isAllowed) {
        return res.status(403).json({ error: 'Plan expired. Contact admin to renew.', planExpired: true });
      }
    }

    try { await updateUserLastActive(decoded.id); } catch (_) { /* non-fatal */ }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required.' });
};

const generateToken = (id) => jwt.sign({ id: String(id) }, JWT_SECRET, { expiresIn: '7d' });

module.exports = { protect, adminOnly, generateToken };
