const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'after_school_db';

if (!uri) {
  console.error('MONGODB_URI not set in environment');
  process.exit(1);
}

const client = new MongoClient(uri, {});

let _db;

async function connect() {
  if (!_db) {
    await client.connect();
    _db = client.db(dbName);
    console.log('Connected to MongoDB:', dbName);
  }
  return _db;
}

module.exports = { connect, ObjectId: require('mongodb').ObjectId };