const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const Stripe = require('stripe');
require('dotenv').config();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'evolve-studio-secret-change-me';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS_HASH = bcrypt.hashSync(process.env.ADMIN_PASS || 'evolve2026', 10);

// --- Database setup ---
const db = new Database(path.join(__dirname, 'leads.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    business TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'new',
    notes TEXT DEFAULT ''
  )
`);

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// --- Auth middleware ---
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/admin/login');
}

// ============================================
// Admin Routes (BEFORE static middleware)
// ============================================

// Admin login page
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/admin/dashboard');
  }
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// Admin login POST
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && bcrypt.compareSync(password, ADMIN_PASS_HASH)) {
    req.session.authenticated = true;
    res.redirect('/admin/dashboard');
  } else {
    res.redirect('/admin/login?error=1');
  }
});

// Admin logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Admin dashboard page - use /admin/dashboard to avoid conflict with /admin directory
app.get('/admin/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

// Redirect /admin to /admin/dashboard
app.get('/admin', (req, res) => {
  res.redirect('/admin/dashboard');
});

// ============================================
// API Routes
// ============================================

// Submit a lead (from the contact form)
app.post('/api/leads', (req, res) => {
  const { name, business, email, phone, link } = req.body;

  if (!name || !business || !email) {
    return res.status(400).json({ error: 'Name, business, and email are required.' });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    const stmt = db.prepare(
      'INSERT INTO leads (name, business, email, phone, link) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(name, business, email, phone || '', link || '');

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error saving lead:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// API: get all leads (protected)
app.get('/api/admin/leads', requireAuth, (req, res) => {
  try {
    const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
    res.json(leads);
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: 'Failed to fetch leads.' });
  }
});

// API: update lead status (protected)
app.patch('/api/admin/leads/:id', requireAuth, (req, res) => {
  const { status, notes } = req.body;
  const { id } = req.params;

  try {
    const updates = [];
    const values = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided.' });
    }

    values.push(id);
    db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating lead:', err);
    res.status(500).json({ error: 'Failed to update lead.' });
  }
});

// API: delete lead (protected)
app.delete('/api/admin/leads/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting lead:', err);
    res.status(500).json({ error: 'Failed to delete lead.' });
  }
});

// API: dashboard stats (protected)
app.get('/api/admin/stats', requireAuth, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
    const newLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'new'").get().count;
    const contacted = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'contacted'").get().count;
    const converted = db.prepare("SELECT COUNT(*) as count FROM leads WHERE status = 'converted'").get().count;
    const today = db.prepare("SELECT COUNT(*) as count FROM leads WHERE date(created_at) = date('now')").get().count;

    res.json({ total, newLeads, contacted, converted, today });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// ============================================
// Stripe Checkout
// ============================================

const PLANS = {
  starter: { name: 'Starter', setup: 49999, monthly: 2499 },
  growth:  { name: 'Growth',  setup: 94999, monthly: 2499 },
  premium: { name: 'Premium', setup: 149999, monthly: 1999 }
};

app.post('/api/checkout', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Payments are not configured. Please contact us.' });
  }

  const { plan, email, businessName } = req.body;

  if (!plan || !PLANS[plan]) {
    return res.status(400).json({ error: 'Invalid plan selected.' });
  }

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const selected = PLANS[plan];
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  try {
    const sessionObj = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `evolve studio - ${selected.name} Plan (Setup)`,
              description: `One-time website setup fee for the ${selected.name} plan. Monthly hosting ($${(selected.monthly / 100).toFixed(2)}/mo) will be billed separately.`
            },
            unit_amount: selected.setup
          },
          quantity: 1
        }
      ],
      metadata: {
        plan: plan,
        business_name: businessName || '',
        monthly_amount: selected.monthly
      },
      success_url: `${baseUrl}/pay-success.html`,
      cancel_url: `${baseUrl}/pay.html?plan=${plan}`
    });

    res.json({ url: sessionObj.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session. Please try again.' });
  }
});

// Serve static files (the frontend) - AFTER all routes
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html']
}));

// ============================================
// Start server
// ============================================
app.listen(PORT, () => {
  console.log(`evolve studio server running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin/dashboard`);
  console.log(`Admin login: http://localhost:${PORT}/admin/login`);
});
