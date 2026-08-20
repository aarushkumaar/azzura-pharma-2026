require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Security & Middlewares
app.use(helmet());
app.use(cors({
  origin: ['https://nazzura.com', 'https://azzura-pharma-2026.vercel.app', 'http://localhost:5500'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-razorpay-signature']
}));

// Rate limiting (basic protection)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Raw body parser for webhooks (needed for signature verification)
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
// JSON parser for other routes
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Pass db pool to routes
app.use((req, res, next) => {
  req.db = pool;
  next();
});

// Routes
app.use('/api/orders', require('./routes/orders'));
app.use('/api/webhooks', require('./routes/webhooks'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

app.listen(port, () => {
  console.log(`Azzura backend listening at http://localhost:${port}`);
});
