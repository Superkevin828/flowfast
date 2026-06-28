const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');

class ProviderAdapter {
  async extractDocumentData() { throw new Error('Provider must implement extractDocumentData'); }
  async answerQuery() { throw new Error('Provider must implement answerQuery'); }
}

/* ── Claude (paid users) ─────────────────────────────────────────────── */
class ClaudeProvider extends ProviderAdapter {
  constructor() {
    super();
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async extractDocumentData({ fileName, rawText, contentType }) {
    const prompt = `You are a document extraction assistant. Extract structured data from the following document content and return ONLY a JSON object (no markdown, no backticks) with these fields where found: documentType, customerName, vendorName, email, phone, invoiceNumber, date, dueDate, total, amount, description, summary.

File name: ${fileName}
Content type: ${contentType}
Content:
${rawText || '(no text extracted)'}`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text.trim();
    let fields = {};
    try {
      fields = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      fields = { summary: text };
    }

    return {
      documentType: fields.documentType || 'Unknown',
      confidence: 0.92,
      fields,
      cleaned: fields,
      summary: fields.summary || `Extracted data from ${fileName}`
    };
  }

  async answerQuery(query, files) {
    const fileContext = files.map((f) => {
      const data = f.structuredData || {};
      return `File: ${f.originalName || f.filename}\nExtracted data: ${JSON.stringify(data)}\nText preview: ${(f.extractedText || '').slice(0, 800)}`;
    }).join('\n\n---\n\n');

    const systemPrompt = `You are FlowFast AI, a business intelligence assistant for SMEs in Uganda and East Africa.
You help users understand their business documents, cash flow, invoices, and financial data.
Be concise, practical, and helpful. Reference specific data from the documents when answering.
${files.length === 0 ? 'No documents uploaded yet — guide the user to upload files first.' : `User has ${files.length} document(s) uploaded.`}`;

    const userContent = files.length > 0
      ? `Documents context:\n${fileContext}\n\nUser question: ${query}`
      : query;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    });

    return {
      answer: response.content[0].text,
      sources: files.length,
      mode: 'claude'
    };
  }
}

/* ── Free AI via Hugging Face Inference API (no token required) ──────── */
class FreeAIProvider extends ProviderAdapter {
  constructor() {
    super();
    // Uses the free serverless Inference API — no API key needed for small models
    this.apiUrl = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3';
    this.hfToken = process.env.HUGGINGFACE_TOKEN || null; // optional: set to raise rate limits
  }

  async extractDocumentData({ fileName }) {
    // Free tier: basic extraction without AI
    return {
      documentType: 'Unknown',
      confidence: 0.5,
      fields: {},
      cleaned: {},
      summary: `Uploaded ${fileName}. Upgrade to Starter or Pro for AI-powered extraction.`
    };
  }

  async answerQuery(query, files) {
    const fileContext = files.length > 0
      ? files.map(f => {
          const d = f.structuredData || {};
          const bits = [
            d.documentType && `Type: ${d.documentType}`,
            d.customerName && `Customer: ${d.customerName}`,
            d.total && `Total: ${d.total}`,
            d.date && `Date: ${d.date}`,
            d.invoiceNumber && `Invoice #: ${d.invoiceNumber}`,
          ].filter(Boolean).join(', ');
          return `• ${f.originalName}${bits ? ' (' + bits + ')' : ''}`;
        }).join('\n')
      : null;

    const systemContext = `You are FlowFast Assistant, a helpful AI for small business owners in Uganda and East Africa. Be brief, friendly, and practical. Answer in 2-4 sentences max.`;

    const userPrompt = fileContext
      ? `${systemContext}\n\nUser has these documents:\n${fileContext}\n\nQuestion: ${query}\n\nAnswer:`
      : `${systemContext}\n\nQuestion: ${query}\n\nAnswer:`;

    try {
      const answer = await this._callHuggingFace(userPrompt);
      return { answer, sources: files.length, mode: 'free' };
    } catch (err) {
      console.warn('[FreeAI] HuggingFace error, using heuristic fallback:', err.message);
      return this._heuristicAnswer(query, files);
    }
  }

  _callHuggingFace(prompt) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.7,
          return_full_text: false,
          stop: ['\nUser:', '\nQuestion:']
        }
      });

      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      };
      if (this.hfToken) headers['Authorization'] = 'Bearer ' + this.hfToken;

      const url = new URL(this.apiUrl);
      const req = https.request(
        { hostname: url.hostname, path: url.pathname, method: 'POST', headers },
        (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              // HF returns array of {generated_text} or an error object
              if (Array.isArray(parsed) && parsed[0]?.generated_text) {
                resolve(parsed[0].generated_text.trim());
              } else if (parsed.error) {
                // Model loading (cold start) — reject so we fall back
                reject(new Error(parsed.error));
              } else {
                reject(new Error('Unexpected response: ' + data.slice(0, 100)));
              }
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  _heuristicAnswer(query, files) {
    const q = query.toLowerCase();
    if (!files.length) {
      return {
        answer: "Please upload a document first and I'll help you analyse it. You can upload invoices, receipts, bank statements, or any business document from the Dashboard.",
        sources: 0, mode: 'free'
      };
    }
    if (q.includes('total') || q.includes('amount') || q.includes('how much')) {
      const totals = files.map(f => f.structuredData?.total).filter(Boolean);
      return {
        answer: totals.length
          ? `From your documents I can see totals of: ${totals.join(', ')}. Upgrade to Pro for a full financial summary with Claude AI.`
          : `I found ${files.length} document(s) but couldn't extract totals automatically. Upgrade to Starter or Pro for full AI extraction.`,
        sources: files.length, mode: 'free'
      };
    }
    if (q.includes('invoice') || q.includes('receipt')) {
      const invoices = files.filter(f => ['invoice','receipt'].includes((f.structuredData?.documentType||'').toLowerCase()));
      return {
        answer: invoices.length
          ? `You have ${invoices.length} invoice/receipt document(s): ${invoices.map(f=>f.originalName).join(', ')}. Upgrade to Pro to chat with them using Claude AI.`
          : `I see ${files.length} document(s) uploaded. Upgrade to Starter or Pro for detailed invoice analysis.`,
        sources: files.length, mode: 'free'
      };
    }
    return {
      answer: `I can see you have ${files.length} document(s) uploaded. As a free user I have limited AI capabilities — upgrade to Starter or Pro to get full Claude AI answers about your documents.`,
      sources: files.length, mode: 'free'
    };
  }
}

/* ── Heuristic-only fallback (no API key, no HF) ────────────────────── */
class HeuristicProvider extends ProviderAdapter {
  async extractDocumentData({ fileName }) {
    return { documentType: 'Unknown', confidence: 0.5, fields: {}, cleaned: {}, summary: `Uploaded ${fileName}` };
  }
  async answerQuery(query, files) {
    if (!files.length) return { answer: 'Please upload a document first so I can help analyse it.', sources: 0, mode: 'heuristic' };
    return { answer: `I reviewed ${files.length} document(s). Set ANTHROPIC_API_KEY to enable full AI responses.`, sources: files.length, mode: 'heuristic' };
  }
}

module.exports = { ProviderAdapter, ClaudeProvider, FreeAIProvider, HeuristicProvider };