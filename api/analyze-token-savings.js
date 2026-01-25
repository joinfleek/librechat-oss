/**
 * Analyze token usage and calculate savings from summarization
 */

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/LibreChat';
const CONVERSATION_ID = '0c45edd2-5ba8-4dc0-ae31-6866c97b100f';
const INSTRUCTIONS_TOKENS = 24263; // From server logs

async function analyze() {
  await mongoose.connect(MONGO_URI);

  const Message = mongoose.connection.collection('messages');
  const Transaction = mongoose.connection.collection('transactions');

  // Get conversation stats
  const messages = await Message.find({ conversationId: CONVERSATION_ID })
    .sort({ createdAt: 1 })
    .toArray();

  console.log('='.repeat(60));
  console.log('TOKEN USAGE ANALYSIS & SAVINGS CALCULATION');
  console.log('='.repeat(60));
  console.log('\nConversation ID:', CONVERSATION_ID);
  console.log('Total messages:', messages.length);

  // Find checkpoints
  const checkpoints = messages.filter(m => m.summary);
  console.log('Checkpoints created:', checkpoints.length);

  // Calculate tokens by phase
  let phase1Tokens = 0;
  let phase2Tokens = 0;
  let phase3Tokens = 0;
  let currentPhase = 1;
  let phase1Messages = 0;
  let phase2Messages = 0;
  let phase3Messages = 0;

  messages.forEach((m) => {
    const tokens = m.tokenCount || 0;
    if (currentPhase === 1) {
      phase1Tokens += tokens;
      phase1Messages++;
      if (m.summary) currentPhase = 2;
    } else if (currentPhase === 2) {
      phase2Tokens += tokens;
      phase2Messages++;
      if (m.summary) currentPhase = 3;
    } else {
      phase3Tokens += tokens;
      phase3Messages++;
    }
  });

  console.log('\n' + '-'.repeat(60));
  console.log('TOKEN DISTRIBUTION BY PHASE');
  console.log('-'.repeat(60));
  console.log(`Phase 1 (before 1st checkpoint): ${phase1Messages} msgs, ${phase1Tokens.toLocaleString()} tokens`);
  console.log(`Phase 2 (between checkpoints):   ${phase2Messages} msgs, ${phase2Tokens.toLocaleString()} tokens`);
  console.log(`Phase 3 (after 2nd checkpoint):  ${phase3Messages} msgs, ${phase3Tokens.toLocaleString()} tokens`);
  console.log(`TOTAL in database: ${(phase1Tokens + phase2Tokens + phase3Tokens).toLocaleString()} tokens`);

  // Checkpoint summaries
  console.log('\n' + '-'.repeat(60));
  console.log('CHECKPOINT SUMMARIES');
  console.log('-'.repeat(60));
  checkpoints.forEach((cp, i) => {
    const cpIndex = messages.findIndex(m => m.messageId === cp.messageId);
    console.log(`Checkpoint ${i + 1}: Message #${cpIndex + 1}, ${cp.summaryTokenCount} tokens`);
  });

  // Calculate WITHOUT summarization
  console.log('\n' + '-'.repeat(60));
  console.log('SCENARIO 1: WITHOUT SUMMARIZATION');
  console.log('-'.repeat(60));

  let cumulativeWithoutSummary = 0;
  let runningTotal = 0;
  let apiCalls = 0;

  messages.forEach((m) => {
    runningTotal += (m.tokenCount || 0);
    // Count tokens on assistant responses (these are when API is called)
    if (m.sender !== 'User') {
      apiCalls++;
      // Would send: instructions + all previous messages
      cumulativeWithoutSummary += runningTotal + INSTRUCTIONS_TOKENS;
    }
  });

  console.log(`API calls made: ${apiCalls}`);
  console.log(`Total tokens sent to LLM: ${cumulativeWithoutSummary.toLocaleString()}`);
  console.log(`Average tokens per call: ${Math.round(cumulativeWithoutSummary / apiCalls).toLocaleString()}`);

  // Calculate WITH summarization
  console.log('\n' + '-'.repeat(60));
  console.log('SCENARIO 2: WITH SUMMARIZATION (Actual)');
  console.log('-'.repeat(60));

  let cumulativeWithSummary = 0;
  runningTotal = 0;
  let currentSummaryTokens = 0;
  let checkpoint1Index = -1;
  let checkpoint2Index = -1;
  apiCalls = 0;

  // Find checkpoint indices
  messages.forEach((m, i) => {
    if (m.summary) {
      if (checkpoint1Index === -1) checkpoint1Index = i;
      else checkpoint2Index = i;
    }
  });

  messages.forEach((m, i) => {
    const tokens = m.tokenCount || 0;
    runningTotal += tokens;

    if (m.summary) {
      // Checkpoint - use summary instead of all previous
      currentSummaryTokens = m.summaryTokenCount;
      runningTotal = 0; // Reset for messages after checkpoint
    }

    if (m.sender !== 'User') {
      apiCalls++;
      let tokensThisCall;

      if (i <= checkpoint1Index) {
        // Before first checkpoint - send all context (no optimization yet)
        tokensThisCall = INSTRUCTIONS_TOKENS + messages.slice(0, i + 1).reduce((sum, msg) => sum + (msg.tokenCount || 0), 0);
      } else if (i <= checkpoint2Index || checkpoint2Index === -1) {
        // After first checkpoint - send summary + messages since checkpoint
        tokensThisCall = INSTRUCTIONS_TOKENS + currentSummaryTokens + runningTotal;
      } else {
        // After second checkpoint
        tokensThisCall = INSTRUCTIONS_TOKENS + currentSummaryTokens + runningTotal;
      }

      cumulativeWithSummary += tokensThisCall;
    }
  });

  console.log(`API calls made: ${apiCalls}`);
  console.log(`Total tokens sent to LLM: ${cumulativeWithSummary.toLocaleString()}`);
  console.log(`Average tokens per call: ${Math.round(cumulativeWithSummary / apiCalls).toLocaleString()}`);

  // Calculate savings
  console.log('\n' + '='.repeat(60));
  console.log('SAVINGS ANALYSIS');
  console.log('='.repeat(60));

  const savings = cumulativeWithoutSummary - cumulativeWithSummary;
  const savingsPercent = ((savings / cumulativeWithoutSummary) * 100).toFixed(1);

  console.log(`\nWithout summarization: ${cumulativeWithoutSummary.toLocaleString()} tokens`);
  console.log(`With summarization:    ${cumulativeWithSummary.toLocaleString()} tokens`);
  console.log(`\nTokens saved: ${savings.toLocaleString()}`);
  console.log(`Reduction: ${savingsPercent}%`);

  // Project to daily usage
  console.log('\n' + '-'.repeat(60));
  console.log('PROJECTED DAILY SAVINGS (Based on Jan 20 usage pattern)');
  console.log('-'.repeat(60));

  // From claude-mem: Jan 20 had 54M tokens in 19.9 hours, ~65M projected for full day
  const dailyTokensWithout = 65000000; // 65M tokens/day without optimization
  const dailySavingsPercent = parseFloat(savingsPercent);
  const dailyTokensWith = dailyTokensWithout * (1 - dailySavingsPercent / 100);
  const dailySavings = dailyTokensWithout - dailyTokensWith;

  console.log(`\nJan 20 baseline: ~65M tokens/day (98.2% prompt tokens)`);
  console.log(`With ${savingsPercent}% reduction:`);
  console.log(`  Before: ${(dailyTokensWithout / 1000000).toFixed(1)}M tokens/day`);
  console.log(`  After:  ${(dailyTokensWith / 1000000).toFixed(1)}M tokens/day`);
  console.log(`  Saved:  ${(dailySavings / 1000000).toFixed(1)}M tokens/day`);

  // Cost projection (approximate OpenRouter rates)
  console.log('\n' + '-'.repeat(60));
  console.log('COST IMPACT (Approximate)');
  console.log('-'.repeat(60));

  // Claude Opus 4.5 via OpenRouter: ~$15/M input, ~$75/M output
  // But 98.2% is prompt tokens, so focus on input
  const costPerMillion = 15; // $15 per million input tokens
  const dailyCostWithout = (dailyTokensWithout / 1000000) * costPerMillion;
  const dailyCostWith = (dailyTokensWith / 1000000) * costPerMillion;
  const dailyCostSavings = dailyCostWithout - dailyCostWith;
  const monthlyCostSavings = dailyCostSavings * 30;

  console.log(`\nDaily cost (without): $${dailyCostWithout.toFixed(2)}`);
  console.log(`Daily cost (with):    $${dailyCostWith.toFixed(2)}`);
  console.log(`Daily savings:        $${dailyCostSavings.toFixed(2)}`);
  console.log(`Monthly savings:      $${monthlyCostSavings.toFixed(2)}`);

  // Breakdown by call
  console.log('\n' + '-'.repeat(60));
  console.log('PER-CALL BREAKDOWN');
  console.log('-'.repeat(60));

  const avgWithout = Math.round(cumulativeWithoutSummary / apiCalls);
  const avgWith = Math.round(cumulativeWithSummary / apiCalls);

  console.log(`\nAverage tokens per API call:`);
  console.log(`  Without summarization: ${avgWithout.toLocaleString()} tokens`);
  console.log(`  With summarization:    ${avgWith.toLocaleString()} tokens`);
  console.log(`  Reduction per call:    ${(avgWithout - avgWith).toLocaleString()} tokens (${((1 - avgWith/avgWithout) * 100).toFixed(1)}%)`);

  await mongoose.disconnect();
}

analyze().catch(err => {
  console.error('Error:', err);
  mongoose.disconnect();
  process.exit(1);
});
