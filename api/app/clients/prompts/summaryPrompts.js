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
 * Token count without variables: ~120 tokens
 * This prompt is used for checkpoint-based compression at 50% context capacity
 * It emphasizes recent messages while condensing older ones
 */
const _WEIGHTED_SUMMARIZER_TEMPLATE = `Summarize this conversation, giving MORE DETAIL to [RECENT] messages and LESS DETAIL to [OLD] ones.

RULES:
1. [RECENT] messages: Summarize in detail with key specifics, data, and context
2. [OLD] messages: Condense to essential points only (1 sentence max each)
3. Previous summary: Integrate and compress further - keep only what's still relevant
4. PRESERVE: user intent, key decisions, data/results, tool outputs, action items
5. DISCARD: pleasantries, repetitive exchanges, verbose explanations

Previous Summary (compress this further):
{previous_summary}

Conversation (oldest to newest, markers indicate detail level):
{messages}

Write a summary that prioritizes recent context while preserving essential history:`;

const WEIGHTED_SUMMARY_PROMPT = new PromptTemplate({
  inputVariables: ['previous_summary', 'messages'],
  template: _WEIGHTED_SUMMARIZER_TEMPLATE,
});

module.exports = {
  SUMMARY_PROMPT,
  CUT_OFF_PROMPT,
  WEIGHTED_SUMMARY_PROMPT,
};
