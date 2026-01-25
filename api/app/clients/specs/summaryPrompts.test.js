const {
  SUMMARY_PROMPT,
  CUT_OFF_PROMPT,
  WEIGHTED_SUMMARY_PROMPT,
} = require('../prompts/summaryPrompts');

describe('Summary Prompts', () => {
  describe('SUMMARY_PROMPT', () => {
    it('should format prompt with summary and new lines', async () => {
      const result = await SUMMARY_PROMPT.format({
        summary: 'Previous summary content',
        new_lines: 'Human: Hello\nAI: Hi there',
      });

      expect(result).toContain('Current summary:');
      expect(result).toContain('Previous summary content');
      expect(result).toContain('New lines:');
      expect(result).toContain('Human: Hello');
      expect(result).toContain('AI: Hi there');
    });

    it('should handle empty summary', async () => {
      const result = await SUMMARY_PROMPT.format({
        summary: '',
        new_lines: 'Human: Test message',
      });

      expect(result).toContain('Current summary:');
      expect(result).toContain('New lines:');
      expect(result).toContain('Human: Test message');
    });
  });

  describe('CUT_OFF_PROMPT', () => {
    it('should format prompt with new lines', async () => {
      const result = await CUT_OFF_PROMPT.format({
        new_lines: 'Truncated content here',
      });

      expect(result).toContain('cut-off');
      expect(result).toContain('Truncated content here');
      expect(result).toContain('Summary:');
    });
  });

  describe('WEIGHTED_SUMMARY_PROMPT', () => {
    it('should format prompt with previous summary and messages', async () => {
      const result = await WEIGHTED_SUMMARY_PROMPT.format({
        previous_summary: 'Previous summary content',
        messages: '[OLD] Human: Old message\n[RECENT] Human: Recent message',
      });

      expect(result).toContain('Previous Summary (compress this further):');
      expect(result).toContain('Previous summary content');
      expect(result).toContain('Conversation (oldest to newest, markers indicate detail level):');
      expect(result).toContain('[OLD] Human: Old message');
      expect(result).toContain('[RECENT] Human: Recent message');
    });

    it('should include recency rules in prompt', async () => {
      const result = await WEIGHTED_SUMMARY_PROMPT.format({
        previous_summary: 'Test',
        messages: 'Test messages',
      });

      expect(result).toContain('[RECENT] messages: Summarize in detail');
      expect(result).toContain('[OLD] messages: Condense to essential points');
      expect(result).toContain('PRESERVE:');
      expect(result).toContain('DISCARD:');
    });

    it('should handle empty previous summary', async () => {
      const result = await WEIGHTED_SUMMARY_PROMPT.format({
        previous_summary: 'No previous summary.',
        messages: '[RECENT] Human: First message',
      });

      expect(result).toContain('No previous summary.');
      expect(result).toContain('[RECENT] Human: First message');
    });

    it('should maintain marker format for parsing', async () => {
      const messages = [
        '[OLD] Human: Message 1',
        '[OLD] AI: Response 1',
        '[OLD] Human: Message 2',
        '[RECENT] AI: Response 2',
        '[RECENT] Human: Latest message',
      ].join('\n');

      const result = await WEIGHTED_SUMMARY_PROMPT.format({
        previous_summary: 'Previous context',
        messages,
      });

      // Verify all markers are present and in order
      expect(result.indexOf('[OLD] Human: Message 1')).toBeLessThan(
        result.indexOf('[RECENT] Human: Latest message'),
      );
    });
  });
});
