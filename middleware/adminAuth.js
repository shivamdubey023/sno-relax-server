// Admin authentication middleware
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const ADMINS_FILE = path.join(__dirname, '..', 'store', 'admins.json');

function getAdmins() {
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (err) {
    console.error('Error reading admins file:', err);
  }
  return [];
}

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Missing admin token' });
    }

    // Check for legacy admin token format (admin-token-*)
    if (token.startsWith('admin-token-')) {
      const admins = getAdmins();
      if (admins.length > 0) {
        req.admin = admins[0];
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized: No admins configured' });
    }

    // Try JWT verification if token doesn't match legacy format
    const jwtSecret = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production';
    
    try {
      const decoded = jwt.verify(token, jwtSecret);
      if (decoded.role === 'admin' || decoded.isAdmin) {
        req.admin = decoded;
        return next();
      }
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    } catch (jwtErr) {
      // JWT verification failed, check if it's a valid legacy token
      if (token.startsWith('admin-token-')) {
        const admins = getAdmins();
        if (admins.length > 0) {
          req.admin = admins[0];
          return next();
        }
      }
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  } catch (err) {
    console.error('Admin auth error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
};
