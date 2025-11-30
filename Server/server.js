require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// ============ SECURITY CONFIGURATION ============

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:8002',
    'https://pushups-frontend.onrender.com',
    'https://emanuswell.christmas',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  optionsSuccessStatus: 200,
  credentials: true
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Stricter rate limit for image uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit to 10 uploads per hour
  message: 'Too many uploads, please try again later.'
});

// ============ DATABASE CONFIGURATION ============

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
  } else {
    console.log('Database connected successfully');
    release();
  }
});

// ============ CLOUDINARY CONFIGURATION ============

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ============ MULTER CONFIGURATION ============

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// ============ HELPER FUNCTIONS ============

// Hash password for admin operations
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('your-secure-admin-password', 10);
const FAILURE_PASSWORD = 'Failure'; // As specified

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/<script[^>]*>.*?<\/script>/gi, '')
              .replace(/<[^>]+>/g, '')
              .trim();
}

// ============ API ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all spheres
app.get('/api/spheres', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, bio, image_url, is_failed, position_x, position_y, position_z, created_at FROM spheres ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching spheres:', error);
    res.status(500).json({ error: 'Failed to fetch spheres' });
  }
});

// Get single sphere with comments
app.get('/api/spheres/:id', async (req, res) => {
  try {
    const sphereId = parseInt(req.params.id);
    
    if (isNaN(sphereId)) {
      return res.status(400).json({ error: 'Invalid sphere ID' });
    }

    const sphereResult = await pool.query(
      'SELECT id, name, bio, image_url, is_failed, created_at FROM spheres WHERE id = $1',
      [sphereId]
    );

    if (sphereResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sphere not found' });
    }

    const commentsResult = await pool.query(
      'SELECT id, comment_text, author_name, created_at FROM comments WHERE sphere_id = $1 ORDER BY created_at DESC',
      [sphereId]
    );

    res.json({
      sphere: sphereResult.rows[0],
      comments: commentsResult.rows
    });
  } catch (error) {
    console.error('Error fetching sphere:', error);
    res.status(500).json({ error: 'Failed to fetch sphere' });
  }
});

// Create new sphere with image upload
app.post('/api/spheres', uploadLimiter, upload.single('image'), [
  body('name').trim().isLength({ min: 1, max: 100 }).escape(),
  body('bio').optional().trim().isLength({ max: 500 }).escape()
], async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Image is required' });
    }

    const { name, bio } = req.body;

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'pushup-challenge',
          transformation: [
            { quality: 'auto:good' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Save to database
    const result = await pool.query(
      'INSERT INTO spheres (name, bio, image_url, cloudinary_public_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [sanitizeInput(name), sanitizeInput(bio) || null, uploadResult.secure_url, uploadResult.public_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating sphere:', error);
    res.status(500).json({ error: 'Failed to create sphere' });
  }
});

// Add comment to sphere
app.post('/api/spheres/:id/comments', [
  body('comment_text').trim().isLength({ min: 1, max: 500 }).escape(),
  body('author_name').optional().trim().isLength({ max: 100 }).escape()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const sphereId = parseInt(req.params.id);
    const { comment_text, author_name } = req.body;

    if (isNaN(sphereId)) {
      return res.status(400).json({ error: 'Invalid sphere ID' });
    }

    // Check if sphere exists
    const sphereCheck = await pool.query('SELECT id FROM spheres WHERE id = $1', [sphereId]);
    if (sphereCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Sphere not found' });
    }

    const result = await pool.query(
      'INSERT INTO comments (sphere_id, comment_text, author_name) VALUES ($1, $2, $3) RETURNING *',
      [sphereId, sanitizeInput(comment_text), sanitizeInput(author_name) || 'Anonymous']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Toggle failure status (requires password)
app.post('/api/spheres/:id/toggle-failure', [
  body('password').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const sphereId = parseInt(req.params.id);
    const { password } = req.body;

    if (isNaN(sphereId)) {
      return res.status(400).json({ error: 'Invalid sphere ID' });
    }

    // Check password
    if (password !== FAILURE_PASSWORD) {
      return res.status(403).json({ error: 'Invalid password' });
    }

    // Toggle the failure status
    const result = await pool.query(
      'UPDATE spheres SET is_failed = NOT is_failed WHERE id = $1 RETURNING *',
      [sphereId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sphere not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error toggling failure status:', error);
    res.status(500).json({ error: 'Failed to toggle failure status' });
  }
});

// Delete sphere (admin only)
app.delete('/api/spheres/:id', [
  body('adminPassword').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const sphereId = parseInt(req.params.id);
    const { adminPassword } = req.body;

    if (isNaN(sphereId)) {
      return res.status(400).json({ error: 'Invalid sphere ID' });
    }

    // Verify admin password
    const isValidPassword = await bcrypt.compare(adminPassword, ADMIN_PASSWORD_HASH);
    if (!isValidPassword) {
      return res.status(403).json({ error: 'Invalid admin password' });
    }

    // Get cloudinary public_id before deleting
    const sphereResult = await pool.query(
      'SELECT cloudinary_public_id FROM spheres WHERE id = $1',
      [sphereId]
    );

    if (sphereResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sphere not found' });
    }

    // Delete from Cloudinary
    if (sphereResult.rows[0].cloudinary_public_id) {
      await cloudinary.uploader.destroy(sphereResult.rows[0].cloudinary_public_id);
    }

    // Delete from database (will cascade delete comments)
    await pool.query('DELETE FROM spheres WHERE id = $1', [sphereId]);

    res.json({ message: 'Sphere deleted successfully' });
  } catch (error) {
    console.error('Error deleting sphere:', error);
    res.status(500).json({ error: 'Failed to delete sphere' });
  }
});

// Update sphere position (for saving drag positions)
app.patch('/api/spheres/:id/position', [
  body('position_x').isFloat(),
  body('position_y').isFloat(),
  body('position_z').isFloat()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const sphereId = parseInt(req.params.id);
    const { position_x, position_y, position_z } = req.body;

    if (isNaN(sphereId)) {
      return res.status(400).json({ error: 'Invalid sphere ID' });
    }

    const result = await pool.query(
      'UPDATE spheres SET position_x = $1, position_y = $2, position_z = $3 WHERE id = $4 RETURNING *',
      [position_x, position_y, position_z, sphereId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sphere not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating position:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;