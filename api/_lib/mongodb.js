import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'notebook';

if (!uri) {
  throw new Error('Missing MONGODB_URI environment variable.');
}

let client;
let clientPromise;

if (!globalThis._mongoClientPromise) {
  client = new MongoClient(uri);
  clientPromise = client.connect();
  globalThis._mongoClientPromise = clientPromise;
} else {
  clientPromise = globalThis._mongoClientPromise;
}

export async function getDb() {
  const connectedClient = await clientPromise;
  return connectedClient.db(dbName);
}