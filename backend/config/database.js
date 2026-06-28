const mongoose = require('mongoose');

async function connectDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/flowfast';

  try {
    const connection = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('MongoDB connected');
    return connection;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    throw new Error('Database connection required');
  }
}

module.exports = { connectDatabase };
