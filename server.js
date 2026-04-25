require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const Url = require('./models/url');
const { nanoid } = require('nanoid');
const { Redis } = require('@upstash/redis');

const app = express();

/* ---------- Redis (Upstash REST) ---------- */
let redisAvailable = true;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Test connection once
(async () => {
  try {
    await redis.set("test", "ok");
    console.log("Redis connected (Upstash)");
  } catch (err) {
    redisAvailable = false;
    console.log("Redis unavailable, falling back to MongoDB");
  }
})();

/* ---------- MongoDB ---------- */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

/* ---------- Express ---------- */
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));

/* ---------- Helper: Safe Cache ---------- */
const cacheGet = async (key) => {
  if (!redisAvailable) return null;
  try {
    return await redis.get(key);
  } catch (err) {
    redisAvailable = false;
    console.log("Redis failed during GET");
    return null;
  }
};

const cacheSet = async (key, value) => {
  if (!redisAvailable) return;
  try {
    // 1 hour TTL
    await redis.set(key, value, { ex: 3600 });
  } catch (err) {
    redisAvailable = false;
    console.log("Redis failed during SET");
  }
};

/* ---------- Routes ---------- */

app.get('/', (req, res) => {
  res.render('index', { shortUrl: null });
});

app.post('/', async (req, res) => {
  const originalUrl = req.body.originalUrl;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  // 🔥 1. Try cache
  const cachedSlug = await cacheGet(originalUrl);
  if (cachedSlug) {
    return res.render('index', {
      shortUrl: `${baseUrl}/${cachedSlug}`
    });
  }

  // 🧠 2. Fallback → MongoDB
  let doc = await Url.findOne({ originalUrl });

  if (!doc) {
    doc = new Url({
      originalUrl,
      shortUrl: nanoid(7),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    await doc.save();
  }

  // ⚡ 3. Try caching (non-blocking mindset)
  await cacheSet(originalUrl, doc.shortUrl);

  res.render('index', {
    shortUrl: `${baseUrl}/${doc.shortUrl}`
  });
});

app.get('/:shortUrl', async (req, res) => {
  const shortUrl = req.params.shortUrl;

  // (Optional: You could cache this direction too later)

  const urlEntry = await Url.findOne({ shortUrl });

  if (!urlEntry) {
    return res.status(404).send('URL not found or expired');
  }

  res.redirect(urlEntry.originalUrl);
});

/* ---------- Server ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});