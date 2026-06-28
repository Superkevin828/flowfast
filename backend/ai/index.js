const { HeuristicProvider } = require('./provider');

class AIService {
  constructor(provider = new HeuristicProvider()) {
    this.provider = provider;
  }

  async extractDocumentData(payload) {
    return this.provider.extractDocumentData(payload);
  }

  async answerQuery(query, files) {
    return this.provider.answerQuery(query, files);
  }
}

module.exports = new AIService();
