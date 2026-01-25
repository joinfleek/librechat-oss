const { PromptTemplate } = require('@langchain/core/prompts');
/*
 * Without `{summary}` and `{new_lines}`, token count is 98
 * We are counting this towards the max context tokens for summaries, +3 for the assistant label (101)
 * If this prompt changes, use https://tiktokenizer.vercel.app/ to count the tokens
 */
const _DEFAULT_SUMMARIZER_TEMPLATE = `Summarize the conversation by integrating new lines into the current summary.

EXAMPLE:
Current summary:
The human inquires about the AI's view on artificial intelligence. The AI believes it's beneficial.

New lines:
Human: Why is it beneficial?
AI: It helps humans achieve their potential.

New summary:
The human inquires about the AI's view on artificial intelligence. The AI believes it's beneficial because it helps humans achieve their potential.

Current summary:
{summary}

New lines:
{new_lines}

New summary:`;

const SUMMARY_PROMPT = new PromptTemplate({
  inputVariables: ['summary', 'new_lines'],
  template: _DEFAULT_SUMMARIZER_TEMPLATE,
});

/*
 * Without `{new_lines}`, token count is 27
 * We are counting this towards the max context tokens for summaries, rounded up to 30
 * If this prompt changes, use https://tiktokenizer.vercel.app/ to count the tokens
 */
const _CUT_OFF_SUMMARIZER = `The following text is cut-off:
{new_lines}

Summarize the content as best as you can, noting that it was cut-off.

Summary:`;

const CUT_OFF_PROMPT = new PromptTemplate({
  inputVariables: ['new_lines'],
  template: _CUT_OFF_SUMMARIZER,
});

/*
 * Token count without variables: ~650 tokens
 * This prompt is used for checkpoint-based compression
 * It uses structured sections to preserve different types of information appropriately
 * Designed for use with powerful models (Opus) for high-fidelity summarization
 */
const _WEIGHTED_SUMMARIZER_TEMPLATE = `You are compressing a conversation to preserve maximum utility in minimal tokens. Structure your summary into the following sections.

## OUTPUT STRUCTURE

### 🎯 INTENT & GOALS
What is the user trying to accomplish? What questions remain open? What is the current task state?

### 📊 DATA & SCHEMA LEARNINGS
Preserve permanently:
- Tables/datasets accessed and their structure (column names, types, relationships)
- Successful query patterns (SQL templates that worked - these are reusable)
- Data characteristics discovered (ranges, distributions, anomalies, key metrics)
- API endpoints and their response structures

Example format:
"shopify.orders: order_id (PK), customer_id (FK→customers), total_price (FLOAT64 - use for GMV), created_at"
"Cohort query pattern: SELECT DATE_TRUNC(first_order, MONTH) as cohort, SUM(total_price) GROUP BY 1"

### 🔧 TOOL EXECUTION SUMMARY
For each tool used, compress to insights not raw data:
- Tool name and purpose
- Key result (metrics, counts, patterns - NOT raw rows)
- Any errors and how they were resolved

Example: "BigQuery execute-query: Ran cohort GMV analysis. Result: 24 cohorts, M1 retention 30-40%, M12 retention 10-50%. May 2024 anomalous (>100%)."

Do NOT include raw query results, CSV data, or full API responses. Extract the insight only.

### 💡 KEY INSIGHTS & DECISIONS
- Conclusions reached from analysis
- Recommendations made and user's response
- Decisions confirmed or rejected
- Important findings that should inform future queries

### ⚠️ ERRORS & RESOLUTIONS
- Errors encountered and their solutions (so we don't repeat mistakes)
- Permission issues and workarounds discovered
- Edge cases identified

### 📍 BREADCRUMBS
Preserve references that enable re-access without re-querying:
- File paths created or modified
- Table names and key columns used
- Important message references
- Artifact IDs or URLs generated

## COMPRESSION RULES

1. **[RECENT] messages**: Full detail - preserve specifics, exact numbers, context
2. **[OLD] messages**: Condense to 1-2 sentences each - keep only essential points
3. **Tool outputs**: Replace raw data with extracted insights
   - Instead of 50 rows → "GMV by cohort: $120K-$900K range, 3x YoY growth"
   - Instead of full schema → "customers table: id, email, created_at, orders→customer_id"
4. **Query results**: Preserve the PATTERN and KEY FINDINGS, discard raw rows
5. **Schema knowledge**: ALWAYS preserve column names and relationships discovered
6. **Errors**: Note what failed and the workaround (prevents repeated failures)

## WHAT TO DISCARD
- Pleasantries and acknowledgments ("Sure!", "Great question")
- Verbose explanations that can be regenerated
- Raw data that has been summarized into insights
- Repeated information already in previous summary
- Step-by-step reasoning (keep conclusions only)

## INPUT

Previous Summary (integrate and compress, keep only what's still relevant):
{previous_summary}

Conversation (markers indicate detail level - [RECENT] = full detail, [OLD] = condense):
{messages}

## OUTPUT

Write a structured summary following the sections above. Be thorough on schema/learnings (persistent value) and concise on conversation flow (transient).`;

const WEIGHTED_SUMMARY_PROMPT = new PromptTemplate({
  inputVariables: ['previous_summary', 'messages'],
  template: _WEIGHTED_SUMMARIZER_TEMPLATE,
});

module.exports = {
  SUMMARY_PROMPT,
  CUT_OFF_PROMPT,
  WEIGHTED_SUMMARY_PROMPT,
};
