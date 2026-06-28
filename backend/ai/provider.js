const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');

class ProviderAdapter {
  async extractDocumentData() { throw new Error('Provider must implement extractDocumentData'); }
  async answerQuery() { throw new Error('Provider must implement answerQuery'); }
}

/* ── Claude (paid users: starter / pro) ──────────────────────────────── */
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
      model: 'claude-haiku-4-5-20251001',
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

  async answerQuery(query, files, history = []) {
    const fileContext = files.map((f) => {
      const data = f.structuredData || {};
      return `File: ${f.originalName || f.filename}\nExtracted data: ${JSON.stringify(data)}\nText preview: ${(f.extractedText || '').slice(0, 800)}`;
    }).join('\n\n---\n\n');

    const systemPrompt = `You are FlowFast AI, a business intelligence assistant for SMEs in Uganda and East Africa.
You help users understand their business documents, cash flow, invoices, and financial data.
Be concise, practical, and helpful. Reference specific data from the documents when answering.
${files.length === 0 ? 'No documents uploaded yet — guide the user to upload files first.' : `User has ${files.length} document(s) uploaded.`}`;

    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      {
        role: 'user',
        content: files.length > 0
          ? `Documents context:\n${fileContext}\n\nUser question: ${query}`
          : query
      }
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

/* ── Free AI — Google Gemini (free tier, no cost) ────────────────────── */
/*   Model: gemini-2.5-flash-lite (fast, free tier available)             */
/*   API:   generativelanguage.googleapis.com — allowed on Render         */
/*   Key:   GEMINI_API_KEY env var (get free at aistudio.google.com)      */
class FreeAIProvider extends ProviderAdapter {
  constructor() {
    super();
    this.apiKey = process.env.GEMINI_API_KEY || null;
    this.model = 'gemini-2.5-flash-lite'; // Free tier, fast, current as of June 2026
    this.baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

    if (this.apiKey) {
      console.log(`[FreeAI] Gemini ${this.model} ready (free tier)`);
    } else {
      console.warn('[FreeAI] GEMINI_API_KEY not set — using smart heuristic fallback');
    }
  }

  async extractDocumentData({ fileName }) {
    // Free tier: basic extraction without heavy AI
    return {
      documentType: 'Unknown',
      confidence: 0.5,
      fields: {},
      cleaned: {},
      summary: `Uploaded ${fileName}. Upgrade to Starter or Pro for full AI-powered extraction.`
    };
  }

  async answerQuery(query, files, history = []) {
    if (this.apiKey) {
      try {
        return await this._geminiAnswer(query, files, history);
      } catch (err) {
        console.warn('[FreeAI] Gemini error, falling back to heuristic:', err.message);
      }
    }
    return this._heuristicAnswer(query, files);
  }

  async _geminiAnswer(query, files, history) {
    const fileContext = files.length > 0
      ? files.map(f => {
          const d = f.structuredData || {};
          return `File: ${f.originalName}\nData: ${JSON.stringify(d)}\nText: ${(f.extractedText || '').slice(0, 400)}`;
        }).join('\n---\n')
      : null;

    const systemInstruction = `You are FlowFast Assistant, a helpful AI for small business owners in Uganda and East Africa.
Be brief, friendly, and practical. Answer in 3-5 sentences. Focus on actionable advice.
${files.length > 0 ? `User has ${files.length} document(s).` : 'No documents uploaded yet.'}`;

    const userContent = fileContext
      ? `Documents:\n${fileContext}\n\nQuestion: ${query}`
      : query;

    // Build Gemini-format contents array (roles: user / model)
    const contents = [
      ...history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: userContent }] }
    ];

    const payload = JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { maxOutputTokens: 512, temperature: 0.7 }
    });

    const answer = await this._callGemini(payload);
    return { answer, sources: files.length, mode: 'free' };
  }

  _callGemini(payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}?key=${this.apiKey}`);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              return reject(new Error(`Gemini API error ${parsed.error.code}: ${parsed.error.message}`));
            }
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) return reject(new Error('No text in Gemini response: ' + data.slice(0, 200)));
            resolve(text.trim());
          } catch (e) {
            reject(e);
          }
        });
      });

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
        sources: 0,
        mode: 'free'
      };
    }

    const totals = files.map(f => f.structuredData?.total).filter(Boolean);
    const amounts = files.map(f => f.structuredData?.amount).filter(Boolean);
    const dates = files.map(f => f.structuredData?.date).filter(Boolean);
    const invoiceNums = files.map(f => f.structuredData?.invoiceNumber).filter(Boolean);
    const customers = files.map(f => f.structuredData?.customerName).filter(Boolean);
    const vendors = files.map(f => f.structuredData?.vendorName).filter(Boolean);
    const allValues = [...totals, ...amounts];

    if (q.includes('total') || q.includes('amount') || q.includes('how much') || q.includes('sum')) {
      if (allValues.length) {
        return { answer: `From your ${files.length} document(s), the amounts found are: ${allValues.join(', ')}.`, sources: files.length, mode: 'free' };
      }
    }
    if (q.includes('invoice') || q.includes('receipt')) {
      const inv = files.filter(f => ['invoice','receipt'].includes((f.structuredData?.documentType||'').toLowerCase()));
      if (inv.length) {
        return { answer: `You have ${inv.length} invoice/receipt(s)${invoiceNums.length ? ' — #' + invoiceNums.join(', #') : ''}: ${inv.map(f => f.originalName).join(', ')}.`, sources: files.length, mode: 'free' };
      }
    }
    if (q.includes('customer') || q.includes('client')) {
      if (customers.length) return { answer: `Customers found: ${customers.join(', ')}.`, sources: files.length, mode: 'free' };
    }
    if (q.includes('vendor') || q.includes('supplier')) {
      if (vendors.length) return { answer: `Vendors found: ${vendors.join(', ')}.`, sources: files.length, mode: 'free' };
    }
    if (q.includes('date') || q.includes('when')) {
      if (dates.length) return { answer: `Document dates: ${dates.join(', ')}.`, sources: files.length, mode: 'free' };
    }
    if (q.includes('summary') || q.includes('overview')) {
      const summary = files.map(f => {
        const d = f.structuredData || {};
        const parts = [d.documentType && `type: ${d.documentType}`, d.total && `total: ${d.total}`, d.date && `date: ${d.date}`].filter(Boolean).join(', ');
        return `• ${f.originalName}${parts ? ' — ' + parts : ''}`;
      }).join('\n');
      return { answer: `Your ${files.length} document(s):\n${summary}`, sources: files.length, mode: 'free' };
    }

    const docNames = files.map(f => f.originalName).join(', ');
    return {
      answer: `I can see ${files.length} document(s): ${docNames}.${allValues.length ? ` Amounts found: ${allValues.join(', ')}.` : ''} Set GEMINI_API_KEY for full AI responses.`,
      sources: files.length,
      mode: 'free'
    };
  }
}

/* ── Heuristic-only (no keys at all) ────────────────────────────────── */
class HeuristicProvider extends ProviderAdapter {
  async extractDocumentData({ fileName }) {
    return { documentType: 'Unknown', confidence: 0.5, fields: {}, cleaned: {}, summary: `Uploaded ${fileName}` };
  }
  async answerQuery(query, files) {
    if (!files.length) return { answer: 'Please upload a document first so I can help analyse it.', sources: 0, mode: 'heuristic' };
    return { answer: `I reviewed ${files.length} document(s). Set GEMINI_API_KEY for free AI responses.`, sources: files.length, mode: 'heuristic' };
  }
}

module.exports = { ProviderAdapter, ClaudeProvider, FreeAIProvider, HeuristicProvider };