require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { connectDatabase } = require('./config/database');
 
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/uploads');
const chatRoutes = require('./routes/chats');
const mappingRoutes = require('./routes/mappings');
const healthRoutes = require('./routes/health');
const paymentRoutes = require('./routes/payments');
const app = express();
const port = process.env.PORT || 8000;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

app.use('/api/auth', authRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/mappings', mappingRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/payments', paymentRoutes);
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pricing.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/chat.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

(async () => {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`FlowFast backend listening on http://localhost:${port}`);
  });
})();
