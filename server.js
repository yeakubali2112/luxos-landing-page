const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const IS_VERCEL = !!process.env.VERCEL;
const DATA_FILE = IS_VERCEL ? path.join('/tmp', 'content.json') : path.join(PUBLIC_DIR, 'data', 'content.json');
const AUTH_FILE = IS_VERCEL ? path.join('/tmp', 'auth.json') : path.join(PUBLIC_DIR, 'data', 'auth.json');
const SESSIONS_FILE = IS_VERCEL ? path.join('/tmp', 'sessions.json') : path.join(PUBLIC_DIR, 'data', 'sessions.json');
const ORDERS_FILE = IS_VERCEL ? path.join('/tmp', 'orders.json') : path.join(PUBLIC_DIR, 'data', 'orders.json');
const UPLOAD_DIR = IS_VERCEL ? path.join('/tmp', 'assets') : path.join(PUBLIC_DIR, 'assets');
const LOGIN_FILE = path.join(PUBLIC_DIR, 'login.html');
const ADMIN_FILE = path.join(PUBLIC_DIR, 'admin.html');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

function loadAuth() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    }
    const bundledAuth = path.join(PUBLIC_DIR, 'data', 'auth.json');
    if (fs.existsSync(bundledAuth)) {
      const auth = JSON.parse(fs.readFileSync(bundledAuth, 'utf-8'));
      if (IS_VERCEL) {
        try {
          if (!fs.existsSync(path.dirname(AUTH_FILE))) fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
          fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), 'utf-8');
        } catch(e) {}
      }
      return auth;
    }
  } catch (e) {}
  const def = { username: 'admin', password: 'admin123' };
  try {
    if (!fs.existsSync(path.dirname(AUTH_FILE))) fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    fs.writeFileSync(AUTH_FILE, JSON.stringify(def, null, 2), 'utf-8');
  } catch (e) {}
  return def;
}

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')));
    }
  } catch (e) {}
  return new Set();
}

function saveSessions(sessionsSet) {
  try {
    if (!fs.existsSync(path.dirname(SESSIONS_FILE))) fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify([...sessionsSet]), 'utf-8');
  } catch (e) {}
}

function loadOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
    }
    // Fallback: seed from initial bundled orders.json
    const bundledOrders = path.join(PUBLIC_DIR, 'data', 'orders.json');
    if (fs.existsSync(bundledOrders)) {
      const orders = JSON.parse(fs.readFileSync(bundledOrders, 'utf-8'));
      if (IS_VERCEL) {
        try {
          if (!fs.existsSync(path.dirname(ORDERS_FILE))) fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });
          fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
        } catch(e) {}
      }
      return orders;
    }
  } catch (e) {}
  return [];
}

function saveOrders(orders) {
  try {
    if (!fs.existsSync(path.dirname(ORDERS_FILE))) fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error saving orders:', e);
    return false;
  }
}

const activeSessions = loadSessions();

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    if (!name) return;
    const value = parts.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

function getSessionSecret() {
  try {
    const auth = loadAuth();
    return crypto.createHash('sha256').update((auth.password || 'admin123') + '_luxos_session_secret_key_2026').digest('hex');
  } catch (e) {
    return 'luxos_fallback_session_secret_key_2026';
  }
}

function createSessionToken(username) {
  const payload = {
    user: username || 'admin',
    created: Date.now(),
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payloadStr).digest('base64url');
  return payloadStr + '.' + sig;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadStr, sig] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(payloadStr).digest('base64url');
    if (sig.length !== expectedSig.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8'));
    if (!payload || !payload.exp || payload.exp < Date.now()) return false;
    return payload;
  } catch (e) {
    return false;
  }
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies['luxos_admin_session'];
  if (!token) return false;

  // 1. Verify stateless cryptographically signed session token (works across all Vercel lambdas & cold starts)
  const session = verifySessionToken(token);
  if (session && session.user) {
    return true;
  }

  // 2. Fallback check for in-memory activeSessions
  if (activeSessions.has(token)) {
    return true;
  }

  return false;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB limit
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURI(parsedUrl.pathname);

  // API ROUTE: POST /api/login
  if (req.method === 'POST' && pathname === '/api/login') {
    try {
      const { username, password } = await readJsonBody(req);
      const auth = loadAuth();
      if (username === auth.username && password === auth.password) {
        const token = createSessionToken(auth.username);
        activeSessions.add(token);
        saveSessions(activeSessions);
        const isSecure = IS_VERCEL || (req.headers['x-forwarded-proto'] === 'https');
        const secureFlag = isSecure ? '; Secure' : '';
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': `luxos_admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureFlag}`
        });
        return res.end(JSON.stringify({ ok: true, message: 'লগইন সফল হয়েছে!' }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: false, error: 'ইউজারনেম বা পাসওয়ার্ড সঠিক নয়!' }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // API ROUTE: POST /api/logout & GET /api/logout
  if (pathname === '/api/logout') {
    const cookies = parseCookies(req);
    const token = cookies['luxos_admin_session'];
    if (token) {
      activeSessions.delete(token);
      saveSessions(activeSessions);
    }
    const isSecure = IS_VERCEL || (req.headers['x-forwarded-proto'] === 'https');
    const secureFlag = isSecure ? '; Secure' : '';
    if (req.method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `luxos_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
      });
      return res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(302, {
        'Location': '/login',
        'Set-Cookie': `luxos_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
      });
      return res.end();
    }
  }

  // API ROUTE: POST /api/change-credentials
  if (req.method === 'POST' && pathname === '/api/change-credentials') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: false, error: 'অননুমোদিত অ্যাক্সেস! অনুগ্রহ করে লগইন করুন।' }));
      }
      const { currentPassword, newUsername, newPassword } = await readJsonBody(req);
      const auth = loadAuth();
      if (currentPassword !== auth.password) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: false, error: 'বর্তমান পাসওয়ার্ডটি ভুল প্রদান করেছেন!' }));
      }
      if (newUsername && newUsername.trim()) {
        auth.username = newUsername.trim();
      }
      if (newPassword && newPassword.trim()) {
        if (newPassword.trim().length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ ok: false, error: 'নতুন পাসওয়ার্ড অন্তত ৪ অক্ষরের হতে হবে!' }));
        }
        auth.password = newPassword.trim();
      }
      fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), 'utf-8');
      const newToken = createSessionToken(auth.username);
      activeSessions.add(newToken);
      saveSessions(activeSessions);
      const isSecure = IS_VERCEL || (req.headers['x-forwarded-proto'] === 'https');
      const secureFlag = isSecure ? '; Secure' : '';
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `luxos_admin_session=${newToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureFlag}`
      });
      return res.end(JSON.stringify({ ok: true, message: 'লগইন তথ্য সফলভাবে পরিবর্তিত হয়েছে!' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // API ROUTE: GET /api/profile (Protected)
  if (req.method === 'GET' && pathname === '/api/profile') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: false, error: 'অননুমোদিত অ্যাক্সেস! অনুগ্রহ করে লগইন করুন।' }));
      }
      const auth = loadAuth();
      const profile = {
        username: auth.username || 'admin',
        name: auth.name || 'LUXOS Admin',
        email: auth.email || 'admin@luxos.com',
        avatar: auth.avatar || 'assets/admin-logo.png',
        role: auth.role || 'সুপার অ্যাডমিন'
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, profile }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // API ROUTE: POST /api/profile (Protected)
  if (req.method === 'POST' && pathname === '/api/profile') {
    try {
      if (!isAuthenticated(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: false, error: 'অননুমোদিত অ্যাক্সেস! অনুগ্রহ করে লগইন করুন।' }));
      }
      const payload = await readJsonBody(req);
      const auth = loadAuth();
      if (payload.name !== undefined) auth.name = payload.name.trim();
      if (payload.email !== undefined) auth.email = payload.email.trim();
      if (payload.avatar !== undefined) auth.avatar = payload.avatar.trim();
      if (payload.role !== undefined) auth.role = payload.role.trim();

      fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), 'utf-8');
      const profile = {
        username: auth.username,
        name: auth.name,
        email: auth.email,
        avatar: auth.avatar,
        role: auth.role
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, message: 'প্রোফাইল তথ্য সফলভাবে সেভ করা হয়েছে!', profile }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // API ROUTE: GET /api/content
  if (req.method === 'GET' && pathname === '/api/content') {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(data);
      }
      const bundledData = path.join(PUBLIC_DIR, 'data', 'content.json');
      if (fs.existsSync(bundledData)) {
        const data = fs.readFileSync(bundledData, 'utf-8');
        if (IS_VERCEL) {
          try {
            if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
            fs.writeFileSync(DATA_FILE, data, 'utf-8');
          } catch(e){}
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(data);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end('{}');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // API ROUTE: POST /api/content (Protected)
  if (req.method === 'POST' && pathname === '/api/content') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'অননুমোদিত অ্যাক্সেস! অনুগ্রহ করে লগইন করুন।' }));
    }
    try {
      const payload = await readJsonBody(req);
      if (!fs.existsSync(path.dirname(DATA_FILE))) {
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, message: 'Settings saved successfully!' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // API ROUTE: GET /api/assets (List available media files)
  if (req.method === 'GET' && pathname === '/api/assets') {
    try {
      const assetsDir = path.join(PUBLIC_DIR, 'assets');
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir);
        const assetList = files.map(file => {
          const stat = fs.statSync(path.join(assetsDir, file));
          return {
            filename: file,
            path: `assets/${file}`,
            size: stat.size,
            ext: path.extname(file).toLowerCase()
          };
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(assetList));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify([]));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // API ROUTE: POST /api/upload (Protected Base64 file upload)
  if (req.method === 'POST' && pathname === '/api/upload') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'অননুমোদিত অ্যাক্সেস! অনুগ্রহ করে লগইন করুন।' }));
    }
    try {
      const payload = await readJsonBody(req);
      const { filename, data } = payload;
      if (!filename || !data) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'filename and data are required' }));
      }
      // sanitize filename
      const cleanName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const base64Data = data.replace(/^data:([A-Za-z-+/]+);base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
      const targetPath = path.join(UPLOAD_DIR, cleanName);
      fs.writeFileSync(targetPath, buffer);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, path: `assets/${cleanName}` }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // API ROUTE: POST /api/orders (Public - Place an order)
  if (req.method === 'POST' && pathname === '/api/orders') {
    try {
      const payload = await readJsonBody(req);
      const orders = loadOrders();

      const fullName = (payload.fullName || payload.name || '').trim();
      const phone = (payload.phone || '').trim();
      const address = (payload.address || '').trim();
      const area = payload.area === 'outside' ? 'outside' : 'inside';
      const quantity = parseInt(payload.quantity, 10) || 1;
      const unitPrice = parseInt(payload.unitPrice, 10) || 2350;
      const deliveryCharge = area === 'outside' ? 130 : 70;
      const totalPrice = (unitPrice * quantity) + deliveryCharge;

      if (!fullName || !phone || !address) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: false, error: 'নাম, মোবাইল নম্বর এবং ঠিকানা পূরণ করা আবশ্যক।' }));
      }

      // Generate unique human-readable ID: LX-1001, LX-1002...
      const orderCount = orders.length + 1;
      const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      const orderId = `LX-${dateStr}-${String(orderCount).padStart(3, '0')}`;

      const newOrder = {
        id: orderId,
        createdAt: new Date().toISOString(),
        customer: {
          name: fullName,
          phone: phone,
          address: address,
          area: area,
          areaName: area === 'inside' ? 'ঢাকা সিটি' : 'ঢাকার বাইরে'
        },
        product: {
          name: payload.productName || 'The Aster by LUXOS',
          color: payload.colorName || payload.color || 'Rosewood',
          colorKey: payload.color || 'rosewood',
          quantity: quantity,
          unitPrice: unitPrice
        },
        pricing: {
          subtotal: unitPrice * quantity,
          delivery: deliveryCharge,
          total: totalPrice
        },
        status: 'pending', // pending, confirmed, shipped, delivered, cancelled
        notes: payload.notes || ''
      };

      orders.unshift(newOrder); // Newest order on top
      saveOrders(orders);

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        ok: true,
        orderId: newOrder.id,
        order: newOrder,
        message: 'অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে!'
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // API ROUTE: GET /api/orders (Protected - View all orders)
  if (req.method === 'GET' && pathname === '/api/orders') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'অননুমোদিত অ্যাক্সেস! অনুগ্রহ করে লগইন করুন।' }));
    }
    try {
      const orders = loadOrders();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, orders }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // API ROUTE: POST /api/orders/status (Protected - Update order status)
  if (req.method === 'POST' && pathname === '/api/orders/status') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'অননুমোদিত অ্যাক্সেস! অনুগ্রহ করে লগইন করুন।' }));
    }
    try {
      const { id, status, notes } = await readJsonBody(req);
      const orders = loadOrders();
      const target = orders.find(o => o.id === id);
      if (!target) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: false, error: 'অর্ডারটি খুঁজে পাওয়া যায়নি।' }));
      }
      if (status) target.status = status;
      if (notes !== undefined) target.notes = notes;
      target.updatedAt = new Date().toISOString();
      saveOrders(orders);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, order: target }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // API ROUTE: POST /api/orders/delete (Protected - Delete order)
  if (req.method === 'POST' && pathname === '/api/orders/delete') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'অননুমোদিত অ্যাক্সেস! অনুগ্রহ করে লগইন করুন।' }));
    }
    try {
      const { id } = await readJsonBody(req);
      let orders = loadOrders();
      orders = orders.filter(o => o.id !== id);
      saveOrders(orders);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, message: 'অর্ডারটি ডিলিট করা হয়েছে।' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // Handle URL rewrites & route guards
  let reqPath = pathname;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  } else if (reqPath === '/login' || reqPath === '/login/') {
    if (isAuthenticated(req)) {
      res.writeHead(302, { 'Location': '/admin' });
      return res.end();
    }
    reqPath = '/login.html';
  } else if (reqPath === '/admin' || reqPath === '/admin/' || reqPath === '/admin.html') {
    if (!isAuthenticated(req)) {
      res.writeHead(302, { 'Location': '/login' });
      return res.end();
    }
    reqPath = '/admin.html';
  }

  let safePath = path.normalize(path.join(PUBLIC_DIR, reqPath));
  if (IS_VERCEL && reqPath.startsWith('/assets/')) {
    const uploadedAsset = path.join(UPLOAD_DIR, path.basename(reqPath));
    if (fs.existsSync(uploadedAsset)) {
      safePath = uploadedAsset;
    }
  }

  if (!safePath.startsWith(PUBLIC_DIR) && !safePath.startsWith(UPLOAD_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const totalSize = stats.size;

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
        return res.end();
      }

      const chunkSize = (end - start) + 1;
      const fileStream = fs.createReadStream(safePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(safePath).pipe(res);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Admin Login available at http://localhost:${PORT}/login`);
  console.log(`Admin Panel available at http://localhost:${PORT}/admin`);
});
