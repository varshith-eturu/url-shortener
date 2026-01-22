require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const Schema = require('./models/url');
const nanoid = require('nanoid');
const redis = require('redis');

const app = express();

/* ---------- Redis ---------- */
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  },
  password: process.env.REDIS_PASSWORD
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

(async () => {
  try {
    await redisClient.connect();
    console.log('Redis connected');
  } catch (err) {
    console.error('Redis connection failed:', err);
  }
})();

/* ---------- MongoDB ---------- */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

/* ---------- Express ---------- */
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));

app.get('/', (req, res) => {
  res.render('index', { shortUrl: null });
});

app.post('/', async (req, res) => {
  const originalUrl = req.body.originalUrl;

  const cachedShortUrl = await redisClient.get(originalUrl);
  if (cachedShortUrl) {
    return res.render('index', { shortUrl: cachedShortUrl });
  }

  let doc = await Schema.findOne({ originalUrl });

  if (!doc) {
    doc = new Schema({
      originalUrl,
      shortUrl: nanoid.nanoid(7),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    await doc.save();
  }

  await redisClient.setEx(originalUrl, 60 * 60, doc.shortUrl);
  return res.render('index', { shortUrl: doc.shortUrl });
});

app.get('/:shortUrl', async (req, res) => {
  const urlEntry = await Schema.findOne({ shortUrl: req.params.shortUrl });
  if (urlEntry) {
    res.redirect(urlEntry.originalUrl);
  } else {
    res.status(404).send('URL not found or expired');
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
