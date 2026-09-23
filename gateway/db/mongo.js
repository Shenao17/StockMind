/**
 * Conexión a MongoDB (colección de logs de StockMind)
 * Ubicación en el proyecto: gateway/db/mongo.js
 */

const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let db;

async function connectMongo() {
    if (db) return db;
    await client.connect();
    db = client.db(); // usa la DB que ya viene en el URI (stockmind_logs)
    console.log('✅ Conectado a MongoDB');
    return db;
}

function getDb() {
    if (!db) throw new Error('MongoDB no está conectado todavía');
    return db;
}

module.exports = { connectMongo, getDb };