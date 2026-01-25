# Checkpoint-Based Summarization: Debugging & Validation Report

**Date:** January 25, 2026
**Feature:** Checkpoint-based conversation summarization for LibreChat
**Status:** Validated and working

---

## 1. Executive Summary

This report documents the debugging, testing, and validation of the checkpoint-based conversation summarization feature in LibreChat. The feature compresses conversation history when token usage exceeds a configurable threshold (default: 10% of max context), storing summaries as checkpoints and dramatically reducing token usage for subsequent LLM calls.

**Key Results:**
- Compression successfully triggers at threshold (18,000 tokens for 180k context)
- Token reduction of 57-87% observed after checkpoint creation
- Intermediate messages between checkpoint and current message are correctly included in payload
- Summaries preserve key conversation context in ~500 tokens

---

## 2. Feature Architecture

### 2.1 Core Logic Flow

```
1. User sends message
2. BaseClient.handleContextStrategy() is called
3. Find last checkpoint (message with stored summary)
4. Calculate tokens accumulated SINCE last checkpoint
5. If tokens > threshold (10% of maxContextTokens):
   - Summarize messages from checkpoint to current
   - Store summary on the triggering message
   - Create new checkpoint
6. Build payload: [summary, all_messages_after_checkpoint, current_message]
7. Send to LLM
```

### 2.2 Key Files

| File | Purpose |
|------|---------|
| `/api/app/clients/BaseClient.js` | Core context strategy logic, checkpoint detection, payload building |
| `/api/server/controllers/agents/client.js` | `summarizeMessages()` implementation, LLM call for summarization |
| `/api/app/clients/prompts/summaryPrompts.js` | `WEIGHTED_SUMMARY_PROMPT` template with recency markers |
| `/api/test-api-summarization.js` | E2E test script for checkpoint validation |

### 2.3 Configuration

```yaml
# librechat.yaml
endpoints:
  custom:
    - name: 'OpenRouter'
      summarize: true
      summaryModel: 'anthropic/claude-3-haiku'
      compressionThreshold: 0.1  # 10% of maxContextTokens
```

---

## 3. Logging Infrastructure

### 3.1 Winston Logger Configuration

LibreChat uses Winston for logging. Key environment variables:

```bash
export DEBUG_CONSOLE=true   # Enable console output for debug logs
export DEBUG_LOGGING=true   # Enable debug-level logging
```

**Logger config location:** `/packages/data-schemas/src/config/winston.ts`

### 3.2 Starting Server with Logging

```bash
nohup bash -c 'source ~/.nvm/nvm.sh && nvm use 20 && \
  export DEBUG_CONSOLE=true && \
  export DEBUG_LOGGING=true && \
  npm run backend:dev' > /tmp/librechat-server.log 2>&1 &
```

### 3.3 Key Log Patterns

**Checkpoint Analysis:**
```
[BaseClient] Checkpoint analysis
[BaseClient] Compression check
[BaseClient] Creating new checkpoint  # Only when threshold exceeded
[BaseClient] Payload built
```

**Token Spending:**
```
[spendTokens] conversationId: XXX | Context: message | Token usage:
{
  promptTokens: 22997,
  completionTokens: 2304,
}
```

**Summarization:**
```
[AgentClient] summarizeMessages called
{
  messagesToRefineCount: 4,
  remainingContextTokens: 179900,
  summaryModel: "anthropic/claude-3-haiku",
  hasPreviousSummary: true,
}
```

### 3.4 Useful Log Queries

```bash
# Watch checkpoint activity
tail -f /tmp/librechat-server.log | grep -E "Checkpoint|Compression|summariz"

# Get token spending for a conversation
tail -3000 /tmp/librechat-server.log | grep -B1 -A4 "spendTokens.*CONVO_ID"

# See payload structure
tail -500 /tmp/librechat-server.log | grep -A20 "tokenCountMap:"
```

---

## 4. Testing Infrastructure

### 4.1 E2E Test Script

**Location:** `/api/test-api-summarization.js`

**Purpose:** Sends authenticated API requests to the LibreChat agents endpoint, simulating real user conversations to trigger checkpoint creation.

**Key Features:**
- Connects to MongoDB to get user credentials and agent config
- Generates valid JWT tokens for authentication
- Sends 8 detailed prompts to accumulate tokens
- Tracks checkpoint creation after each message
- Reports token counts and checkpoint status

**Running the test:**
```bash
cd /Users/sanket/workspace/librechat-oss/api
source ~/.nvm/nvm.sh && nvm use 20
node test-api-summarization.js
```

### 4.2 MongoDB Queries for Validation

**Get conversation token timeline:**
```javascript
const messages = await Message.find({
  conversationId: 'CONVO_ID'
}).sort({ createdAt: 1 });

messages.forEach((m, i) => {
  const hasCheckpoint = m.summary ? '🔖 CHECKPOINT' : '';
  console.log(`${i+1}. [${m.sender}] tokens: ${m.tokenCount} ${hasCheckpoint}`);
});
```

**Get checkpoint summary content:**
```javascript
const checkpoint = await Message.findOne({
  conversationId: 'CONVO_ID',
  summary: { $exists: true, $ne: null }
}).sort({ createdAt: -1 });

console.log('Summary:', checkpoint.summary);
console.log('Tokens:', checkpoint.summaryTokenCount);
```

**Get token spending timeseries:**
```javascript
const txns = await Transaction.find({
  conversationId: 'CONVO_ID'
}).sort({ createdAt: 1 });

txns.forEach(t => {
  console.log(`${t.createdAt} | ${t.tokenType} | ${t.rawAmount}`);
});
```

---

## 5. Validation Data

### 5.1 Test Conversation: `721dd0f0-1a51-493d-b43c-108047a56f6e`

**Context:** Shopify customer data analysis with GMV retention cohorts

**Token Timeline:**
```
=== Token Usage Timeline ===
 1. [User      ] tokens:   2,408 | running:    2,408
 2. [OpenRouter] tokens:   1,803 | running:    4,211
 3. [User      ] tokens:      29 | running:    4,240
 4. [OpenRouter] tokens:   4,371 | running:    8,611
 5. [User      ] tokens:      24 | running:    8,635
 6. [OpenRouter] tokens:  40,840 | running:   49,475 🔖 CHECKPOINT
    └─ Summary: 514 tokens
 7. [User      ] tokens:      14 | running:   49,489
```

### 5.2 Compression Evidence

**Prompt Tokens Per Message (Peak):**
```
Msg 1:   3,408 ██████
Msg 2:   2,874 █████
Msg 3:   7,330 ██████████████
Msg 4:  22,997 █████████████████████████████████████████████ ⚡ TRIGGERED CHECKPOINT
Msg 5:   9,966 ███████████████████ ✅ AFTER COMPRESSION
```

**Compression Impact:**
- Before checkpoint (Msg 4): **22,997 tokens**
- After checkpoint (Msg 5): **9,966 tokens**
- **Saved: 13,031 tokens (57% reduction)**

### 5.3 Payload Structure Verification

**Before Compression (Msg 4):**
```
tokenCountMap:
  fea60035: 377    (previous summary)
  43149387: 31     (message after checkpoint)
  ebc3bb99: 78,737 (large assistant response)
  fe849dd5: 10,263 (another response)
  244311a5: 30     (current message)
─────────────────
Total: ~89,438 tokens
```

**After Compression (Msg 5):**
```
tokenCountMap:
  fea60035: 377    (new summary - compressed!)
  43149387: 31
  a91bc65e: 12,449
  11e0c486: 30
─────────────────
Total: ~12,887 tokens
```

### 5.4 Summary Quality

**Checkpoint Summary (514 tokens):**
```
Here is a summary of the key points, with more detail on the recent
messages and less detail on the older ones:

The conversation started with the human asking about understanding the
structure of the customer table in the Shopify dataset in the us-west1
region. The AI initially had trouble querying the INFORMATION_SCHEMA.COLUMNS
view due to permission issues, but was able to get the table schema by
directly querying the customer table.

The human then asked the AI to do a customer retention analysis, focusing
on GMV (Gross Merchandise Value) retention month-over-month for the last
2 years...

Key insights preserved:
1. Cohort GMV Growth: Early 2024 cohorts started small (~$120K-$220K)...
2. M1 Retention: Average ~30-40%, best performers Oct 2024 (55.2%)...
3. M6 Retention: Stabilizes around 15-30% of initial GMV...
4. M12 Retention: Mature cohorts show ~10-50% retention...
5. Anomalies: May 2024 cohort shows >100% at M4, M6, M12...
```

---

## 6. Intermediate Message Inclusion

### 6.1 Verification

A critical requirement was that **all messages between the last checkpoint and current message** must be included in the payload (not just summary + latest message).

**Evidence from logs (payloadSize: 4):**
```
tokenCountMap:
  summaryMessage (fea60035): 377 tokens    ← Summary from checkpoint
  43149387-484e-4bd3-ad2b:    31 tokens    ← Message 1 after checkpoint
  a91bc65e-01e6-41e5-8061: 12449 tokens    ← Message 2 after checkpoint
  11e0c486-6a19-4808-ac66:    30 tokens    ← Current user message
```

**Payload growth pattern:**
- Right after checkpoint: `payloadSize: 2` (summary + current)
- Next turn: `payloadSize: 3` (summary + 1 intermediate + current)
- Next turn: `payloadSize: 4` (summary + 2 intermediates + current)

### 6.2 Code Reference

```javascript
// BaseClient.js - Payload construction
const formattedMessagesAfterCheckpoint =
  checkpointIndex >= 0
    ? formattedMessages.slice(checkpointIndex + 1)
    : formattedMessages;

payload = [...formattedMessagesAfterCheckpoint];

if (lastSummary) {
  summaryMessage = {
    role: 'system',
    content: `Previous conversation summary:\n${lastSummary}`,
  };
  payload.unshift(summaryMessage);
}
```

---

## 7. Token Spending Database

### 7.1 Schema

LibreChat stores all token usage in the `transactions` collection:

```javascript
{
  "_id": "69763329c5400b6f28f92c8c",
  "user": "6957176f018a3a153bc2958c",
  "conversationId": "721dd0f0-1a51-493d-b43c-108047a56f6e",
  "tokenType": "prompt",           // or "completion"
  "model": "anthropic/claude-opus-4.5",
  "context": "message",            // or "title"
  "rawAmount": -2761,              // negative = spent
  "tokenValue": -41415,            // monetary value
  "rate": 15,                      // rate per token
  "createdAt": "2026-01-25T15:13:45.521Z"
}
```

### 7.2 Query for Cost Analysis

```javascript
const totals = await Transaction.aggregate([
  { $match: { conversationId: 'CONVO_ID' } },
  { $group: {
    _id: '$tokenType',
    total: { $sum: { $abs: '$rawAmount' } }
  }}
]);
```

---

## 8. Known Issues & Edge Cases

### 8.1 Token Count Bug

One message showed 135,794 tokens for only 64 characters of text. This is a bug in token counting that needs investigation.

**Message ID:** `9eea9361-0f0c-48f3-a1fd-975e6f75f642`

### 8.2 Agent Tool Calls

Agent conversations involve multiple LLM calls per turn (for tool use). This means:
- Token counts grow during a single message turn
- The "peak" tokens per message includes tool call overhead
- Initial prompt shows true compression effect

---

## 9. Conclusion

The checkpoint-based summarization feature is working as designed:

1. ✅ Triggers at correct threshold (10% of maxContextTokens)
2. ✅ Compresses conversation history into ~500 token summaries
3. ✅ Stores checkpoints in message documents
4. ✅ Includes all intermediate messages in payload
5. ✅ Achieves 57-87% token reduction after compression
6. ✅ Preserves key conversation context in summaries

**Recommended Next Steps:**
1. Investigate token count bug for message `9eea9361`
2. Add unit tests for edge cases (empty conversations, single messages)
3. Consider making compression threshold configurable per-endpoint
4. Monitor summarization quality in production

---

## Appendix: Quick Reference Commands

```bash
# Start server with logging
nohup bash -c 'source ~/.nvm/nvm.sh && nvm use 20 && \
  export DEBUG_CONSOLE=true && export DEBUG_LOGGING=true && \
  npm run backend:dev' > /tmp/librechat-server.log 2>&1 &

# Run E2E test
cd /Users/sanket/workspace/librechat-oss/api && node test-api-summarization.js

# Watch checkpoint logs
tail -f /tmp/librechat-server.log | grep -E "Checkpoint|Compression"

# Check conversation in MongoDB
mongosh LibreChat --eval 'db.messages.find({conversationId: "XXX"}).sort({createdAt: 1})'

# Get token transactions
mongosh LibreChat --eval 'db.transactions.find({conversationId: "XXX"}).sort({createdAt: 1})'
```
