const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const fs = require('fs');
const path = require('path');

class ProviderAdapter {
  async extractDocumentData() { throw new Error('Provider must implement extractDocumentData'); }
  async answerQuery() { throw new Error('Provider must implement answerQuery'); }
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Map file extension → Gemini-compatible MIME type */
function mimeForFile(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const map = {
    '.pdf':  'application/pdf',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.csv':  'text/csv',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls':  'application/vnd.ms-excel',
    '.json': 'application/json',
    '.xml':  'application/xml',
    '.txt':  'text/plain',
    '.doc':  'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

/** Decide if a file should be sent as inline bytes vs plain text */
function canSendInline(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  // Gemini can natively read these as bytes
  const inline = ['.pdf','.png','.jpg','.jpeg','.gif','.webp'];
  return inline.includes(ext);
}

/** Safely read a file as base64 (returns null on failure) */
function readBase64(filePath) {
  try {
    return fs.readFileSync(filePath).toString('base64');
  } catch { return null; }
}

/* ── Claude (paid users: starter / pro) ──────────────────────────────── */
class ClaudeProvider extends ProviderAdapter {
  constructor() {
    super();
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async extractDocumentData({ fileName, rawText, contentType }) {
    const prompt = `You are a document extraction assistant. Extract structured data from the following document content and return ONLY a JSON object (no markdown, no backticks) with these fields where found: documentType, customerName, vendorName, email, phone, invoiceNumber, date, dueDate, total, amount, description, summary.\n\nFile name: ${fileName}\nContent type: ${contentType}\nContent:\n${rawText || '(no text extracted)'}`;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text.trim();
    let fields = {};
    try { fields = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { fields = { summary: text }; }

    return {
      documentType: fields.documentType || 'Unknown',
      confidence: 0.92,
      fields,
      cleaned: fields,
      summary: fields.summary || `Extracted data from ${fileName}`
    };
  }

  async answerQuery(query, files, history = []) {
    // Build content array with inline documents for PDFs/images
    const fileContext = files.map((f) => {
      const data = f.structuredData || {};
      const base64 = f.filePath && canSendInline(f.originalName) ? readBase64(f.filePath) : null;
      return base64
        ? { type: 'document', source: { type: 'base64', media_type: mimeForFile(f.originalName), data: base64 } }
        : `File: ${f.originalName || f.filename}\nExtracted data: ${JSON.stringify(data)}\nText: ${(f.extractedText || '').slice(0, 800)}`;
    });

    const systemPrompt = `You are FlowFast AI, a business intelligence assistant for SMEs in Uganda and East Africa. Help users understand their business documents. Be concise, practical, and reference specific data.\n${files.length === 0 ? 'No documents uploaded yet.' : `User has ${files.length} document(s).`}`;

    const userContent = [];
    fileContext.forEach(fc => {
      if (typeof fc === 'string') userContent.push({ type: 'text', text: fc });
      else userContent.push(fc);
    });
    userContent.push({ type: 'text', text: files.length > 0 ? `\nUser question: ${query}` : query });

    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userContent }
    ];

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages
    });

    return { answer: response.content[0].text, sources: files.length, mode: 'claude' };
  }
}

/* ── Free AI — Google Gemini (free tier) ─────────────────────────────── */
class FreeAIProvider extends ProviderAdapter {
  constructor() {
    super();
    this.apiKey = process.env.GEMINI_API_KEY || null;
    this.model = 'gemini-2.5-flash-lite';
    this.baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    if (this.apiKey) console.log(`[FreeAI] Gemini ${this.model} ready`);
    else console.warn('[FreeAI] GEMINI_API_KEY not set — using heuristic fallback');
  }

  async extractDocumentData({ fileName, rawText, filePath, contentType }) {
    if (!this.apiKey) {
      return { documentType: 'Unknown', confidence: 0.5, fields: {}, cleaned: {}, summary: `Uploaded ${fileName}. No cloud AI key configured — set GEMINI_API_KEY or ANTHROPIC_API_KEY for full extraction.` };
    }
    try {
      // Use Gemini for extraction too if we have a key
      const parts = [{ text: `Extract structured data from this document and return ONLY a JSON object with: documentType, customerName, vendorName, email, phone, invoiceNumber, date, dueDate, total, amount, summary.\n\nFile: ${fileName}\n${rawText ? 'Content:\n' + rawText.slice(0, 2000) : ''}` }];
      if (filePath && canSendInline(fileName)) {
        const b64 = readBase64(filePath);
        if (b64) parts.unshift({ inlineData: { mimeType: mimeForFile(fileName), data: b64 } });
      }
      const payload = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 512, temperature: 0.1 } });
      const raw = await this._callGemini(payload);
      let fields = {};
      try { fields = JSON.parse(raw.replace(/```json|```/g,'').trim()); } catch { fields = { summary: raw }; }
      return { documentType: fields.documentType || 'Unknown', confidence: 0.85, fields, cleaned: fields, summary: fields.summary || `Extracted from ${fileName}` };
    } catch {
      return { documentType: 'Unknown', confidence: 0.5, fields: {}, cleaned: {}, summary: `Uploaded ${fileName}` };
    }
  }

  async answerQuery(query, files, history = []) {
    if (this.apiKey) {
      try { return await this._geminiAnswer(query, files, history); }
      catch (err) { console.warn('[FreeAI] Gemini error, falling back:', err.message); }
    }
    return this._heuristicAnswer(query, files);
  }

  async _geminiAnswer(query, files, history) {
    const systemInstruction = `You are FlowFast Assistant, a helpful AI for small business owners in Uganda and East Africa. Be concise and practical. ${files.length > 0 ? `User has ${files.length} document(s).` : 'No documents yet.'}`;

    // Build parts for the user turn — inline files + text
    const userParts = [];
    for (const f of files) {
      if (f.filePath && canSendInline(f.originalName)) {
        const b64 = readBase64(f.filePath);
        if (b64) {
          userParts.push({ inlineData: { mimeType: mimeForFile(f.originalName), data: b64 } });
          continue;
        }
      }
      // Fall back to text context
      const d = f.structuredData || {};
      userParts.push({ text: `File: ${f.originalName}\nData: ${JSON.stringify(d)}\nText: ${(f.extractedText || '').slice(0, 600)}` });
    }
    userParts.push({ text: files.length > 0 ? `\nQuestion: ${query}` : query });

    const contents = [
      ...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: userParts }
    ];

    const payload = JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
    });

    const answer = await this._callGemini(payload);
    return { answer, sources: files.length, mode: 'free' };
  }

  _callGemini(payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}?key=${this.apiKey}`);
      const opts = {
        hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      };
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(`Gemini ${parsed.error.code}: ${parsed.error.message}`));
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) return reject(new Error('No text in Gemini response: ' + data.slice(0, 200)));
            resolve(text.trim());
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  _heuristicAnswer(query, files) {
    const q = query.toLowerCase();
    if (!files.length) return { answer: "Upload a document first — I'll help you analyse it.", sources: 0, mode: 'free' };
    const totals = files.map(f => f.structuredData?.total).filter(Boolean);
    const amounts = files.map(f => f.structuredData?.amount).filter(Boolean);
    const allValues = [...totals, ...amounts];
    if (q.includes('total') || q.includes('amount') || q.includes('how much')) {
      if (allValues.length) return { answer: `From your ${files.length} document(s), amounts found: ${allValues.join(', ')}.`, sources: files.length, mode: 'free' };
    }
    if (q.includes('summary') || q.includes('overview')) {
      const summary = files.map(f => {
        const d = f.structuredData || {};
        const parts = [d.documentType && `type: ${d.documentType}`, d.total && `total: ${d.total}`, d.date && `date: ${d.date}`].filter(Boolean).join(', ');
        return `• ${f.originalName}${parts ? ' — ' + parts : ''}`;
      }).join('\n');
      return { answer: `Your ${files.length} document(s):\n${summary}`, sources: files.length, mode: 'free' };
    }
      return { answer: `I can see ${files.length} document(s): ${files.map(f=>f.originalName).join(', ')}. For full AI analysis configure GEMINI_API_KEY (Google) or ANTHROPIC_API_KEY (Claude).`, sources: files.length, mode: 'free' };
  }
}

class HeuristicProvider extends ProviderAdapter {
  async extractDocumentData({ fileName }) {
    return { documentType: 'Unknown', confidence: 0.5, fields: {}, cleaned: {}, summary: `Uploaded ${fileName}` };
  }
  async answerQuery(query, files) {
    if (!files.length) return { answer: 'Upload a document first.', sources: 0, mode: 'heuristic' };
    return { answer: `I see ${files.length} document(s). Set GEMINI_API_KEY for AI responses.`, sources: files.length, mode: 'heuristic' };
  }
}

module.exports = { ProviderAdapter, ClaudeProvider, FreeAIProvider, HeuristicProvider };