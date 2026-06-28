const Anthropic = require('@anthropic-ai/sdk');

class ProviderAdapter {
  async extractDocumentData() { throw new Error('Provider must implement extractDocumentData'); }
  async answerQuery() { throw new Error('Provider must implement answerQuery'); }
}

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

// Fallback heuristic provider (used if no API key)
class HeuristicProvider extends ProviderAdapter {
  async extractDocumentData({ fileName }) {
    return { documentType: 'Unknown', confidence: 0.5, fields: {}, cleaned: {}, summary: `Uploaded ${fileName}` };
  }

  async answerQuery(query, files) {
    if (!files.length) return { answer: 'Please upload a document first so I can help analyze it.', sources: 0, mode: 'heuristic' };
    return { answer: `I reviewed ${files.length} document(s). Set ANTHROPIC_API_KEY to enable full AI responses.`, sources: files.length, mode: 'heuristic' };
  }
}

module.exports = { ProviderAdapter, ClaudeProvider, HeuristicProvider };