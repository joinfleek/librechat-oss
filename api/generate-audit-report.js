/**
 * Generate comprehensive audit report for checkpoint-based summarization
 */

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/LibreChat';
const CONVERSATION_ID = '0c45edd2-5ba8-4dc0-ae31-6866c97b100f';

async function generateReport() {
  await mongoose.connect(MONGO_URI);

  const Message = mongoose.connection.collection('messages');

  // Get all messages sorted by creation time
  const messages = await Message.find({ conversationId: CONVERSATION_ID })
    .sort({ createdAt: 1 })
    .toArray();

  let output = '';
  output += '# Checkpoint-Based Summarization Audit Report\n';
  output += '============================================\n\n';
  output += 'Conversation ID: ' + CONVERSATION_ID + '\n';
  output += 'Total Messages: ' + messages.length + '\n';
  output += 'Generated: ' + new Date().toISOString() + '\n\n';

  // Calculate total tokens
  const totalTokens = messages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
  output += 'Total Tokens in Conversation: ' + totalTokens.toLocaleString() + '\n';
  output += 'Compression Threshold: 10% of 180,000 = 18,000 tokens\n\n';

  output += '---\n\n';
  output += '## Configuration\n\n';
  output += '- maxContextTokens: 180,000\n';
  output += '- compressionThreshold: 0.1 (10%)\n';
  output += '- Threshold for new checkpoint: 18,000 tokens\n';
  output += '- Recency weighting: Last 5 messages marked as [RECENT]\n';
  output += '- Max summary tokens: 2,000\n\n';

  output += '---\n\n';
  output += '## Checkpoints Summary\n\n';

  const checkpoints = messages.filter(m => m.summary);
  output += 'Total Checkpoints: ' + checkpoints.length + '\n\n';

  checkpoints.forEach((cp, i) => {
    const cpIndex = messages.findIndex(m => m.messageId === cp.messageId);
    output += '### Checkpoint ' + (i + 1) + '\n';
    output += '- Message Index: ' + (cpIndex + 1) + ' of ' + messages.length + '\n';
    output += '- Message ID: `' + cp.messageId + '`\n';
    output += '- Created At: ' + cp.createdAt + '\n';
    output += '- Summary Token Count: ' + cp.summaryTokenCount + '\n';
    output += '- Trigger: Tokens exceeded threshold after previous checkpoint\n\n';
    output += '**Summary Content:**\n\n```\n';
    output += cp.summary + '\n```\n\n';
    output += '---\n\n';
  });

  output += '## Complete Message Flow\n\n';
  output += 'Legend:\n';
  output += '- 🔖 = Message has checkpoint/summary stored on it\n';
  output += '- Tokens shown are for that individual message\n\n';

  let runningTokens = 0;
  let tokensSinceCheckpoint = 0;

  messages.forEach((msg, i) => {
    const hasCheckpoint = Boolean(msg.summary);
    const tokens = msg.tokenCount || 0;
    runningTokens += tokens;
    tokensSinceCheckpoint += tokens;

    output += '### Message ' + (i + 1) + (hasCheckpoint ? ' 🔖 CHECKPOINT' : '') + '\n\n';
    output += '| Field | Value |\n';
    output += '|-------|-------|\n';
    output += '| Role | ' + msg.sender + ' |\n';
    output += '| Message ID | `' + msg.messageId + '` |\n';
    output += '| Parent ID | `' + (msg.parentMessageId || 'N/A') + '` |\n';
    output += '| Created | ' + msg.createdAt + ' |\n';
    output += '| Token Count | ' + tokens.toLocaleString() + ' |\n';
    output += '| Running Total | ' + runningTokens.toLocaleString() + ' |\n';
    output += '| Tokens Since Last Checkpoint | ' + tokensSinceCheckpoint.toLocaleString() + ' |\n';

    if (hasCheckpoint) {
      output += '| **CHECKPOINT STORED** | Yes (Summary: ' + msg.summaryTokenCount + ' tokens) |\n';
      tokensSinceCheckpoint = 0; // Reset after checkpoint
    }

    output += '\n**Content:**\n\n';

    // Get content
    let content = msg.text || '';
    if (typeof content === 'object') {
      content = JSON.stringify(content, null, 2);
    }

    // Truncate very long content
    if (content.length > 3000) {
      output += '```\n' + content.substring(0, 3000) + '\n```\n\n';
      output += '*... [TRUNCATED - ' + (content.length - 3000) + ' more characters] ...*\n';
    } else if (content.length > 0) {
      output += '```\n' + content + '\n```\n';
    } else {
      output += '*[No text content]*\n';
    }

    output += '\n---\n\n';
  });

  output += '## Token Analysis\n\n';
  output += '| Metric | Value |\n';
  output += '|--------|-------|\n';
  output += '| Total Messages | ' + messages.length + ' |\n';
  output += '| Total Tokens in DB | ' + totalTokens.toLocaleString() + ' |\n';
  output += '| Checkpoints Created | ' + checkpoints.length + ' |\n';
  output += '| Compression Threshold | 18,000 tokens |\n';
  output += '| Max Context Tokens | 180,000 |\n\n';

  output += '## How Compression Works\n\n';
  output += '1. When a new message is sent, the system loads message history\n';
  output += '2. If a previous checkpoint exists, messages are loaded starting from that checkpoint\n';
  output += '3. Token count is calculated for loaded messages + instructions\n';
  output += '4. If tokens exceed threshold (18,000), compression triggers:\n';
  output += '   - All loaded messages are summarized using recency-weighted prompt\n';
  output += '   - Recent messages get [RECENT] marker for detailed summarization\n';
  output += '   - Older messages get [OLD] marker for brief summarization\n';
  output += '   - Summary is stored on the trigger message (second-to-last)\n';
  output += '   - Payload sent to LLM: [instructions, summary, latest_message]\n';
  output += '5. Next request starts fresh from the new checkpoint\n\n';

  output += '## Compression Log Observations\n\n';
  output += 'From server logs during testing:\n\n';
  output += '```\n';
  output += '# Before first checkpoint (initial conversation had 379k tokens)\n';
  output += '[BaseClient] Compression Check: totalTokens=379000+, threshold=18000, shouldTrigger=true\n';
  output += '[BaseClient] Compression triggered\n';
  output += '[AgentClient] Summarization successful\n';
  output += '[BaseClient] Checkpoint compression complete\n';
  output += '\n';
  output += '# After first checkpoint (subsequent messages)\n';
  output += '[BaseClient] Found previous checkpoint\n';
  output += '[BaseClient] Compression Check: totalTokens=17986, threshold=18000, shouldTrigger=false\n';
  output += '# (Only counting tokens AFTER the checkpoint)\n';
  output += '\n';
  output += '# When second checkpoint triggered\n';
  output += '[BaseClient] Found previous checkpoint\n';
  output += '[BaseClient] Compression Check: totalTokens=18275, threshold=18000, shouldTrigger=true\n';
  output += '[BaseClient] Compression triggered\n';
  output += '[AgentClient] Summarization successful\n';
  output += '[BaseClient] Checkpoint compression complete\n';
  output += '```\n\n';

  // Write to file
  const outputPath = '/Users/sanket/workspace/librechat-oss/CHECKPOINT_AUDIT_REPORT.md';
  fs.writeFileSync(outputPath, output);
  console.log('Audit report written to:', outputPath);
  console.log('Total messages:', messages.length);
  console.log('Total checkpoints:', checkpoints.length);

  await mongoose.disconnect();
}

generateReport().catch(err => {
  console.error('Error:', err);
  mongoose.disconnect();
  process.exit(1);
});
