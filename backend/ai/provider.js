class ProviderAdapter {
  async extractDocumentData() {
    throw new Error('Provider must implement extractDocumentData');
  }

  async answerQuery() {
    throw new Error('Provider must implement answerQuery');
  }
}

class HeuristicProvider extends ProviderAdapter {
  async extractDocumentData({ fileName, rawText, contentType }) {
    const text = (rawText || '').trim();
    const lower = text.toLowerCase();

    const inferredType = this.detectDocumentType(lower, fileName);
    const fields = this.extractFields(text);
    const cleaned = this.cleanData(fields);

    return {
      documentType: inferredType,
      confidence: inferredType === 'unknown' ? 0.58 : 0.84,
      fields,
      cleaned,
      summary: `Detected ${inferredType} fields from ${fileName}`
    };
  }

  async answerQuery(query, files) {
    const lowerQuery = query.toLowerCase();
    const fileSummaries = files.map((file) => ({
      ...file.structuredData,
      fileName: file.originalName || file.filename || 'document',
      documentType: file.structuredData?.documentType || this.detectDocumentType(lowerQuery, file.originalName || file.filename || 'document'),
      extractedText: file.extractedText || ''
    }));

    if (!fileSummaries.length) {
      return {
        answer: 'Upload an invoice, contract, receipt, report, or form and I can analyze it for your office workflow.',
        sources: 0,
        mode: 'heuristic'
      };
    }

    const amounts = fileSummaries.flatMap((entry) => [entry.total, entry.amount, entry.revenue]).filter(Boolean);
    const names = fileSummaries.flatMap((entry) => [entry.customerName, entry.name, entry.fullName, entry.vendorName]).filter(Boolean);
    const invoiceNumbers = fileSummaries.flatMap((entry) => [entry.invoiceNumber, entry.invoice_id]).filter(Boolean);
    const emails = fileSummaries.flatMap((entry) => [entry.email]).filter(Boolean);
    const dates = fileSummaries.flatMap((entry) => [entry.date, entry.dueDate]).filter(Boolean);

    if (lowerQuery.includes('summary') || lowerQuery.includes('summarize') || lowerQuery.includes('overview')) {
      const first = fileSummaries[0];
      const summaryBits = [`I reviewed ${fileSummaries.length} office document(s).`, `Primary type: ${first.documentType || 'document'}.`];
      if (first.total) summaryBits.push(`Estimated value: ${first.total}.`);
      if (first.customerName) summaryBits.push(`Related party: ${first.customerName}.`);
      if (first.email) summaryBits.push(`Contact: ${first.email}.`);
      return { answer: summaryBits.join(' '), sources: fileSummaries.length, mode: 'heuristic' };
    }

    if (lowerQuery.includes('action') || lowerQuery.includes('next step') || lowerQuery.includes('follow up') || lowerQuery.includes('what should')) {
      const actions = ['Review the document for approval.', 'Confirm the key contact and deadline.'];
      if (invoiceNumbers.length) actions.push(`Check invoice ${invoiceNumbers[0]} for payment status.`);
      if (amounts.length) actions.push(`Verify the amount of ${amounts[0]}.`);
      if (dates.length) actions.push(`Follow up before ${dates[0]}.`);
      return { answer: `Office workflow suggestion: ${actions.join(' ')}`, sources: fileSummaries.length, mode: 'heuristic' };
    }

    if (lowerQuery.includes('total') || lowerQuery.includes('revenue') || lowerQuery.includes('amount') || lowerQuery.includes('balance')) {
      const total = amounts.reduce((sum, value) => sum + Number(value || 0), 0);
      return { answer: `The detected financial value is ${total.toFixed(2)} across the available office documents.`, sources: fileSummaries.length, mode: 'heuristic' };
    }

    if (lowerQuery.includes('customer') || lowerQuery.includes('vendor') || lowerQuery.includes('name')) {
      return { answer: `Relevant names found: ${names.join(', ') || 'No names detected'}.`, sources: fileSummaries.length, mode: 'heuristic' };
    }

    if (lowerQuery.includes('invoice') || lowerQuery.includes('invoice number')) {
      return { answer: `Invoice numbers detected: ${invoiceNumbers.join(', ') || 'None detected'}.`, sources: fileSummaries.length, mode: 'heuristic' };
    }

    if (lowerQuery.includes('contact') || lowerQuery.includes('email') || lowerQuery.includes('phone')) {
      return { answer: `Contact details found: ${emails.join(', ') || 'No contact details detected'}.`, sources: fileSummaries.length, mode: 'heuristic' };
    }

    if (lowerQuery.includes('due') || lowerQuery.includes('deadline') || lowerQuery.includes('date')) {
      return { answer: `Important dates detected: ${dates.join(', ') || 'No dates detected'}.`, sources: fileSummaries.length, mode: 'heuristic' };
    }

    return {
      answer: `I reviewed ${fileSummaries.length} office document(s) and can help with summaries, amounts, contacts, invoice numbers, due dates, and next steps.`,
      sources: fileSummaries.length,
      mode: 'heuristic'
    };
  }

  detectDocumentType(lower, fileName) {
    if (lower.includes('invoice') || fileName.includes('invoice')) return 'Invoice';
    if (lower.includes('receipt') || fileName.includes('receipt')) return 'Receipt';
    if (lower.includes('bank') || lower.includes('statement')) return 'Bank Statement';
    if (lower.includes('contract')) return 'Contract';
    if (lower.includes('resume')) return 'Resume';
    if (lower.includes('passport')) return 'Passport';
    if (lower.includes('tax')) return 'Tax Form';
    return 'Unknown';
  }

  extractFields(text) {
    const fields = {};
    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phoneMatch = text.match(/\+?[0-9\s()-]{7,}/);
    const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2} [A-Za-z]+ \d{4})\b/);
    const amountMatch = text.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/);

    if (emailMatch) fields.email = emailMatch[0];
    if (phoneMatch) fields.phone = phoneMatch[0].trim();
    if (dateMatch) fields.date = dateMatch[0];
    if (amountMatch) fields.total = Number(amountMatch[0].replace(/[$,]/g, ''));

    const nameMatch = text.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/);
    if (nameMatch) fields.customerName = nameMatch[1];

    const invoiceMatch = text.match(/invoice[^\n]{0,20}(\d+)/i);
    if (invoiceMatch) fields.invoiceNumber = invoiceMatch[1];

    return fields;
  }

  cleanData(fields) {
    return {
      ...fields,
      normalized: {
        email: fields.email ? fields.email.toLowerCase() : null,
        phone: fields.phone ? fields.phone.replace(/\s+/g, ' ') : null,
        total: typeof fields.total === 'number' ? Number(fields.total.toFixed(2)) : null
      }
    };
  }
}

module.exports = {
  ProviderAdapter,
  HeuristicProvider
};
