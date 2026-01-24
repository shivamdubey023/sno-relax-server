// Admin authentication middleware
module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    // For now, just check if token exists and starts with "admin-token-"
    // In production, this should validate JWT tokens properly
    if (token && token.startsWith('admin-token-')) {
      // Token is valid (basic check)
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized: Invalid or missing admin token' });
    }
  } catch (err) {
    console.error('Admin auth error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
};
