# Summarization & Context Compression: Research & Best Practices

**Date:** January 25, 2026
**Purpose:** Research on optimal summarization prompts, tool output compression, and preserving learnings for LibreChat checkpoint-based summarization.

---

## 1. Executive Summary

This research synthesizes best practices from Anthropic, Factory.ai, JetBrains Research, and academic papers on context compression for LLM agents. Key findings:

1. **Hybrid approach works best**: Observation masking (replacing old tool outputs with placeholders) + selective LLM summarization
2. **Tool outputs need special handling**: Preserve schema/structure knowledge, discard raw data
3. **Use powerful models for summarization**: Opus-class models produce higher-fidelity summaries
4. **Anchor summaries to messages**: Incremental updates beat full re-summarization
5. **Preserve "learnings" explicitly**: Extract insights, patterns, and decisions separately from raw data

---

## 2. Current State: Your Summarization Prompt

Your current `WEIGHTED_SUMMARY_PROMPT`:

```javascript
`Summarize this conversation, giving MORE DETAIL to [RECENT] messages and LESS DETAIL to [OLD] ones.

RULES:
1. [RECENT] messages: Summarize in detail with key specifics, data, and context
2. [OLD] messages: Condense to essential points only (1 sentence max each)
3. Previous summary: Integrate and compress further - keep only what's still relevant
4. PRESERVE: user intent, key decisions, data/results, tool outputs, action items
5. DISCARD: pleasantries, repetitive exchanges, verbose explanations
...`
```

**Strengths:**
- Recency weighting is correct
- Preserves key decisions and action items

**Gaps:**
- No explicit handling for tool call results (BigQuery, MCP tools)
- No structured output format for different information types
- No explicit "learnings" extraction
- Generic rules that don't leverage Opus's capabilities

---

## 3. Best Practices from Research

### 3.1 Anthropic's Context Engineering Guidelines

From [Anthropic's Engineering Blog](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents):

> "The fundamental approach is finding the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome."

**Key Techniques:**

1. **Tool Result Clearing**: Remove raw tool outputs once their utility has passed, keeping only derived insights
2. **Progressive Compaction**: Maximize recall first, then iterate to improve precision
3. **Structured Note-Taking**: Persist learnings outside context window for retrieval
4. **Sub-agent Delegation**: Return condensed summaries (1,000-2,000 tokens) not exhaustive logs

### 3.2 Factory.ai's Incremental Summarization

From [Factory.ai's Context Compression](https://factory.ai/news/compressing-context):

**Summary Anchoring Pattern:**
```
┌─────────────────────────────────────────────────────────┐
│ Persistent Summary (anchored to message N)              │
├─────────────────────────────────────────────────────────┤
│ Messages N+1 to N+K (full fidelity)                     │
├─────────────────────────────────────────────────────────┤
│ Current message                                         │
└─────────────────────────────────────────────────────────┘
```

**What to Preserve in Coding/Data Sessions:**
- Session intent and stated requirements
- High-level action sequences
- File/table artifacts created, modified, or queried
- Breadcrumbs enabling re-access (file paths, table names, query patterns)

### 3.3 JetBrains Research: Observation Masking

From [JetBrains Research Blog](https://blog.jetbrains.com/research/2025/12/efficient-context-management/):

**Key Finding:** Observation masking (replacing old tool outputs with placeholders) outperformed LLM summarization in efficiency and often in quality.

**Hybrid Approach:**
1. **Primary**: Mask old tool outputs with placeholders like `[BigQuery result: 15 rows returned, see learnings below]`
2. **Secondary**: Use LLM summarization only when context becomes critically large
3. **Result**: 50%+ cost reduction with maintained solve rates

### 3.4 Tool Output Summarization Strategies

From [SQL Agent Architecture research](https://medium.com/@testth02/sql-agent-architecture-from-query-to-insight-with-llms-9417ba208cb4):

**For SQL/BigQuery Results:**
1. **Summarize the query pattern**, not just the result
2. **Extract schema learnings**: "The `customer` table has `gmv` in the `orders` join"
3. **Preserve query templates**: Successful queries become reusable patterns
4. **Note data characteristics**: "GMV retention drops 40% at M1, stabilizes at M6"

---

## 4. Recommended Prompt Architecture for Opus

### 4.1 Enhanced Summarization Prompt

```javascript
const OPUS_COMPRESSION_PROMPT = `You are compressing a conversation to preserve maximum utility in minimal tokens.

## STRUCTURE YOUR SUMMARY INTO SECTIONS:

### 🎯 INTENT & GOALS
What is the user trying to accomplish? What questions remain open?

### 📊 DATA & SCHEMA LEARNINGS
- Tables/datasets accessed and their structure
- Successful query patterns (preserve SQL templates that worked)
- Data characteristics discovered (ranges, distributions, anomalies)
- Schema relationships learned

### 🔧 TOOL EXECUTION SUMMARY
For each tool type used, summarize:
- What was attempted
- What succeeded/failed
- Key outputs (compress raw data to insights)

Example format:
"BigQuery: Queried customer cohort GMV retention. Found M1 retention ~30-40%,
 stabilizes at M6. Query pattern: cohort by first_order_month, pivot by months_since."

### 💡 KEY INSIGHTS & DECISIONS
- Conclusions reached
- Recommendations made
- Decisions the user confirmed

### ⚠️ CAVEATS & OPEN ISSUES
- Errors encountered and how they were resolved
- Limitations discovered
- Questions that remain unanswered

### 📍 BREADCRUMBS
Preserve references that enable re-access:
- File paths mentioned
- Table names and key columns
- API endpoints used
- Message IDs of important outputs

## COMPRESSION RULES:

1. **Tool outputs**: Replace raw data with insights. Instead of 50 rows of GMV data,
   write "GMV by cohort: ranges from $120K to $900K, growing 3x YoY"

2. **Query results**: Preserve the QUERY PATTERN and KEY FINDINGS, discard raw rows.
   "SELECT cohort_month, SUM(gmv) GROUP BY 1 → Found seasonal dip in Q1"

3. **Recency weighting**: Recent messages get 3x the detail of older ones

4. **Error handling**: If something failed, note WHY and what workaround was used

5. **Schema memory**: When a table structure is discovered, ALWAYS preserve column
   names and relationships. This prevents repeated INFORMATION_SCHEMA queries.

## INPUT:

Previous Summary:
{previous_summary}

Recent Conversation:
{messages}

## OUTPUT:

Write a structured summary following the sections above. Target 500-800 tokens.`;
```

### 4.2 Tool-Specific Compression Templates

For BigQuery/SQL tools specifically:

```javascript
const TOOL_OUTPUT_TEMPLATES = {
  bigquery: {
    // Instead of raw results, store this pattern:
    compressed: `
      QUERY: {natural_language_intent}
      TABLES: {tables_used}
      PATTERN: {sql_template_with_placeholders}
      RESULT: {key_metrics_only}
      LEARNING: {what_we_learned_about_the_data}
    `,
    example: `
      QUERY: Customer GMV retention by cohort
      TABLES: orders JOIN customers ON customer_id
      PATTERN: SELECT DATE_TRUNC(first_order, MONTH) as cohort, ... GROUP BY 1
      RESULT: 24 cohorts, M1 retention 30-40%, M12 retention 10-50%
      LEARNING: May 2024 cohort anomalous (>100% retention), likely high-value repeats
    `
  },

  file_read: {
    compressed: `
      FILE: {path}
      PURPOSE: {why_it_was_read}
      KEY_CONTENT: {relevant_excerpts_only}
    `
  },

  api_call: {
    compressed: `
      ENDPOINT: {url_pattern}
      PURPOSE: {intent}
      STATUS: {success/failure}
      KEY_DATA: {extracted_insights}
    `
  }
};
```

### 4.3 Observation Masking Implementation

Before summarization, pre-process tool outputs:

```javascript
function maskToolOutputs(messages, windowSize = 5) {
  return messages.map((msg, idx) => {
    const isRecent = idx >= messages.length - windowSize;

    if (isRecent || msg.role !== 'tool') {
      return msg; // Keep recent tool outputs in full
    }

    // Mask old tool outputs
    return {
      ...msg,
      content: `[Tool result from ${msg.name}: ${summarizeToolOutput(msg)}]`
    };
  });
}

function summarizeToolOutput(toolMsg) {
  if (toolMsg.name === 'execute-query') {
    const result = JSON.parse(toolMsg.content);
    return `${result.rows?.length || 0} rows returned from ${extractTableNames(result)}`;
  }
  // ... other tool types
}
```

---

## 5. Specific Recommendations for BigQuery Learnings

### 5.1 Schema Memory Pattern

Create a dedicated schema memory section that persists across summaries:

```
### 📊 SCHEMA MEMORY (Persistent)

**shopify.customers**
- customer_id (STRING, PK)
- email, first_name, last_name
- created_at, updated_at
- Relationship: orders.customer_id → customers.customer_id

**shopify.orders**
- order_id (STRING, PK)
- customer_id (FK → customers)
- total_price, subtotal_price (FLOAT64)
- created_at, processed_at
- Note: Use total_price for GMV calculations
```

### 5.2 Query Pattern Library

Preserve successful query patterns as reusable templates:

```
### 🔧 QUERY PATTERNS (Reusable)

**Cohort Retention Analysis**
```sql
WITH cohorts AS (
  SELECT customer_id,
         DATE_TRUNC(MIN(created_at), MONTH) as cohort_month
  FROM orders GROUP BY 1
)
SELECT cohort_month,
       DATE_DIFF(order_month, cohort_month, MONTH) as months_since,
       SUM(total_price) as gmv
FROM cohorts JOIN orders USING (customer_id)
GROUP BY 1, 2
```
Used for: M1/M6/M12 retention, GMV trends

**Permission Workaround**
When INFORMATION_SCHEMA fails, query table directly with LIMIT 0:
`SELECT * FROM dataset.table LIMIT 0` → returns schema
```

### 5.3 Insight Extraction Pattern

Extract and preserve analytical insights separately:

```
### 💡 DATA INSIGHTS (Accumulated)

**GMV Retention Patterns**
- M1 retention: 30-40% typical, >45% is strong
- M6 retention: Stabilizes at 15-30%
- M12 retention: 10-50% range, highly variable

**Cohort Anomalies Identified**
- May 2024: >100% at M4/M6/M12 → investigate high-value repeats
- Feb 2024: 88.7% at M18 → exceptional long-term value

**Seasonal Patterns**
- Q1 dip in new customer acquisition
- Q4 spike in GMV (holiday effect)
```

---

## 6. Implementation Recommendation

### 6.1 Upgrade Path

1. **Phase 1: Enhanced Prompt** (Immediate)
   - Replace `WEIGHTED_SUMMARY_PROMPT` with structured Opus prompt
   - Add sections for tool outputs, schema memory, learnings

2. **Phase 2: Observation Masking** (Next)
   - Pre-process messages before summarization
   - Mask old tool outputs with compressed placeholders
   - Keep last 5 tool outputs in full fidelity

3. **Phase 3: Persistent Memory** (Future)
   - Store schema learnings in separate persistent storage
   - Query patterns become retrievable assets
   - Insights accumulate across conversations

### 6.2 Model Selection

| Use Case | Recommended Model | Rationale |
|----------|-------------------|-----------|
| **Summarization** | Claude Opus 4 | Highest fidelity, best at preserving nuance |
| **Quick compression** | Claude Sonnet 4 | Good balance of speed/quality |
| **Schema extraction** | Claude Haiku | Fast, structured output |

### 6.3 Token Budget Allocation

For a 2000-token summary budget:
- Intent & Goals: ~100 tokens
- Schema Memory: ~300 tokens (persistent, grows slowly)
- Tool Summaries: ~400 tokens
- Key Insights: ~400 tokens
- Recent Context: ~600 tokens
- Breadcrumbs: ~200 tokens

---

## 7. Sources

- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Factory.ai: Compressing Context](https://factory.ai/news/compressing-context)
- [JetBrains Research: Efficient Context Management](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)
- [Mem0: LLM Chat History Summarization Guide](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)
- [Claude Memory Tool Documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- [Agenta: Techniques to Manage Context Length](https://agenta.ai/blog/top-6-techniques-to-manage-context-length-in-llms)
- [Microsoft LLMLingua](https://github.com/microsoft/LLMLingua)
- [SQL Agent Architecture: From Query to Insight](https://medium.com/@testth02/sql-agent-architecture-from-query-to-insight-with-llms-9417ba208cb4)

---

## 8. Next Steps

1. Review and refine the enhanced prompt template
2. Test with Opus on existing conversation data
3. Implement observation masking for BigQuery tool outputs
4. Build schema memory persistence layer
5. Create evaluation metrics for summary quality
