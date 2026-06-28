const Mapping = require('../models/Mapping');

async function listMappings(req, res) {
  const mappings = await Mapping.find({ userId: req.user.id }).sort({ createdAt: -1 });
  return res.json({ mappings });
}

async function createMapping(req, res) {
  const { sourceField, targetField, description = '' } = req.body;
  const mapping = await Mapping.create({ userId: req.user.id, sourceField, targetField, description });
  return res.status(201).json({ mapping });
}

module.exports = { listMappings, createMapping };
