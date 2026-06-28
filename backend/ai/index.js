const { ClaudeProvider, HeuristicProvider } = require('./provider');

class AIService {
  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.provider = new ClaudeProvider();
      console.log('[AI] Using ClaudeProvider (Anthropic API)');
    } else {
      this.provider = new HeuristicProvider();
      console.warn('[AI] ANTHROPIC_API_KEY not set — using HeuristicProvider (set the env var to enable Claude)');
    }
  }

  async extractDocumentData(payload) {
    return this.provider.extractDocumentData(payload);
  }

  async answerQuery(query, files) {
    return this.provider.answerQuery(query, files);
  }
}

module.exports = new AIService();