require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const Url = require('./models/url');
const { nanoid } = require('nanoid');
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
  await redisClient.connect();
  console.log('Redis connected');
})();

/* ---------- MongoDB ---------- */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

/* ---------- Express ---------- */
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));

app.get('/', (req, res) => {
  res.render('index', { shortUrl: null });
});

app.post('/', async (req, res) => {
  const originalUrl = req.body.originalUrl;

  const cachedSlug = await redisClient.get(originalUrl);
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  if (cachedSlug) {
    return res.render('index', {
      shortUrl: `${baseUrl}/${cachedSlug}`
    });
  }

  let doc = await Url.findOne({ originalUrl });

  if (!doc) {
    doc = new Url({
      originalUrl,
      shortUrl: nanoid(7),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    await doc.save();
  }

  await redisClient.setEx(originalUrl, 3600, doc.shortUrl);

  res.render('index', {
    shortUrl: `${baseUrl}/${doc.shortUrl}`
  });
});

app.get('/:shortUrl', async (req, res) => {
  const urlEntry = await Url.findOne({ shortUrl: req.params.shortUrl });

  if (!urlEntry) {
    return res.status(404).send('URL not found or expired');
  }

  res.redirect(urlEntry.originalUrl);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
