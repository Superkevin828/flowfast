const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const Session = require('../models/Session');

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, email, password } = parsed.data;

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ error: 'User already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash });
  const token = createToken(user);
  await Session.create({ userId: user._id, token, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) });
  return res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
}

async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createToken(user);
  await Session.create({ userId: user._id, token, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) });
  return res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
}

function profile(req, res) {
  return res.json({ user: req.user });
}

function createToken(user) {
  return jwt.sign({ userId: user._id || user.id, email: user.email, name: user.name }, process.env.JWT_SECRET || 'flowfast-dev-secret', { expiresIn: '7d' });
}

module.exports = { register, login, profile };
