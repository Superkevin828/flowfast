const { ClaudeProvider, FreeAIProvider, HeuristicProvider } = require('./provider');

class AIService {
  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.claudeProvider = new ClaudeProvider();
      console.log('[AI] ClaudeProvider ready (paid users)');
    } else {
      this.claudeProvider = null;
      console.warn('[AI] ANTHROPIC_API_KEY not set — paid users will fall back to FreeAI');
    }
    this.freeProvider = new FreeAIProvider();
    console.log('[AI] FreeAIProvider ready (free users)');
  }

  // plan: 'free' | 'starter' | 'pro'
  async extractDocumentData(payload, plan = 'free') {
    const provider = this._pick(plan);
    return provider.extractDocumentData(payload);
  }

  async answerQuery(query, files, plan = 'free', history = []) {
    const provider = this._pick(plan);
    return provider.answerQuery(query, files, history);
  }

  _pick(plan) {
    const isPaid = plan === 'starter' || plan === 'pro';
    if (isPaid && this.claudeProvider) return this.claudeProvider;
    return this.freeProvider;
  }
}

module.exports = new AIService();