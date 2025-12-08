require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - body: ${JSON.stringify(req.body || {})}`);
  next();
});

// Images middleware: serve images or return JSON error
app.get('/images/:name', (req, res) => {
  const name = req.params.name;
  const filepath = path.join(__dirname, 'images', name);
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).json({ error: 'Image not found' });
  }
});

// Optional static: serve frontend in local testing if you place vue-app next to express-app
// MOVE THIS TO END: app.use('/', express.static(path.join(__dirname, '..', 'vue-app')));

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'CWOakdale';
if (!uri) {
  console.error('ERROR: MONGODB_URI not found in environment variables');
  process.exit(1);
}
const client = new MongoClient(uri);

let db;
async function start() {
  await client.connect();
  db = client.db(dbName);
  // create text index for subject+location for search
  try {
    await db.collection('lesson').createIndex({ subject: "text", location: "text" });
  } catch(e){ /* ignore */ }
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('Server listening on', PORT));
}
start().catch(err => { console.error(err); process.exit(1); });

/* Routes */

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// GET /api/lessons
app.get('/api/lessons', async (req, res) => {
  try {
    const lessons = await db.collection('lesson').find({}).toArray();
    res.json(lessons.map(l => ({ ...l, _id: l._id.toString() })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/search?q=term  (server-side search)
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    // use text index if q is multiple chars, else regex fallback
    const isNumeric = !isNaN(Number(q));
    const regex = new RegExp(q, 'i');

    let query;
    // If q is a single char or text, use regex on fields; also fallback numeric search on price/availableSpace
    query = {
      $or: [
        { subject: regex },
        { location: regex },
      ]
    };

    if (isNumeric) {
      const n = Number(q);
      query.$or.push({ price: n });
      query.$or.push({ availableSpace: n });
    }

    const results = await db.collection('lesson').find(query).toArray();
    res.json(results.map(r => ({ ...r, _id: r._id.toString() })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/orders
app.post('/api/orders', async (req, res) => {
  try {
    const { name, phone, lessons, createdAt } = req.body;
    if (!name || !phone || !lessons || !Array.isArray(lessons) || lessons.length===0) {
      return res.status(400).json({ error: 'Invalid order payload' });
    }
    const doc = { name, phone, lessons, createdAt: createdAt || new Date().toISOString() };
    const r = await db.collection('order').insertOne(doc);
    res.json({ insertedId: r.insertedId.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/lessons/:id  - update fields or use { $incSpaces: n } to change availableSpace
app.put('/api/lessons/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const updates = {};
    if (typeof body.$incSpaces === 'number') {
      updates.$inc = { availableSpace: body.$incSpaces };
    }
    ['subject','location','price','availableSpace','icon'].forEach(k => {
      if (body[k] !== undefined) {
        updates.$set = updates.$set || {};
        updates.$set[k] = body[k];
      }
    });

    if (!updates.$set && !updates.$inc) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    const r = await db.collection('lesson').findOneAndUpdate(
      { _id: new ObjectId(id) },
      updates,
      { returnDocument: 'after' }
    );
    if (!r.value) return res.status(404).json({ error: 'Lesson not found' });
    res.json({ updated: true, lesson: { ...r.value, _id: r.value._id.toString() } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve frontend static files AFTER API routes
app.use('/', express.static(path.join(__dirname, '..', 'FrontEndVue-App')));
