/**
 * Realistic test for checkpoint-based summarization
 * Uses parameters closer to real-world usage
 * Run with: node test-realistic-summarization.js
 */

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const crypto = require('crypto');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/LibreChat';

// More accurate token counting (GPT-style approximation)
function countTokens(text) {
  return Math.ceil(text.length / 4);
}

async function testRealisticSummarization() {
  console.log('=== Realistic Checkpoint Summarization Test ===\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB\n');

  const { WEIGHTED_SUMMARY_PROMPT } = require('./app/clients/prompts/summaryPrompts');
  const { ChatOpenAI } = require('@langchain/openai');

  // Test configuration (simulating smaller context window)
  const MAX_CONTEXT_TOKENS = 2000;  // Smaller to trigger compression
  const COMPRESSION_THRESHOLD = 0.5;  // 50% = 1000 tokens
  const MAX_SUMMARY_TOKENS = 300;  // Capped summary
  const RECENT_MESSAGE_COUNT = 5;

  // Generate a longer conversation with substantial content
  const conversationHistory = [];

  const topics = [
    { q: 'Explain quantum computing in detail.', a: 'Quantum computing harnesses quantum mechanical phenomena like superposition and entanglement to perform computations. Unlike classical computers that use bits (0 or 1), quantum computers use qubits that can exist in multiple states simultaneously. This enables parallel processing of vast amounts of data. Key concepts include quantum gates (analogous to logic gates), quantum circuits, and quantum algorithms like Shor\'s algorithm for factoring and Grover\'s algorithm for searching. Challenges include decoherence, error correction, and maintaining extremely low temperatures.' },
    { q: 'What are the practical applications?', a: 'Practical applications of quantum computing include: 1) Drug discovery - simulating molecular interactions, 2) Cryptography - breaking current encryption and enabling quantum-safe alternatives, 3) Financial modeling - optimizing portfolios and risk analysis, 4) Climate modeling - complex weather simulations, 5) Machine learning - quantum-enhanced optimization and pattern recognition, 6) Supply chain optimization - solving complex logistics problems. Companies like IBM, Google, and Microsoft are leading development.' },
    { q: 'How does quantum entanglement work?', a: 'Quantum entanglement is a phenomenon where two or more particles become correlated in such a way that the quantum state of each particle cannot be described independently. When you measure one entangled particle, you instantly know information about its partner, regardless of distance. This "spooky action at a distance" (Einstein\'s term) doesn\'t allow faster-than-light communication but enables quantum teleportation and quantum key distribution. Entanglement is created through controlled interactions and preserved through careful isolation.' },
    { q: 'What is quantum supremacy?', a: 'Quantum supremacy (or quantum advantage) refers to a quantum computer performing a calculation that would be practically impossible for classical computers. Google claimed quantum supremacy in 2019 with their Sycamore processor completing a task in 200 seconds that would take classical supercomputers 10,000 years. However, this was a specific benchmark problem, not a generally useful computation. IBM disputed the claim, showing classical computers could solve it faster than Google estimated. True practical quantum advantage for real-world problems remains a goal.' },
    { q: 'Explain quantum error correction.', a: 'Quantum error correction (QEC) is crucial because qubits are extremely fragile and prone to errors from environmental noise. Unlike classical error correction which can simply copy bits, quantum information cannot be copied (no-cloning theorem). QEC uses redundancy by encoding logical qubits across multiple physical qubits. The surface code is popular, arranging qubits in a 2D grid where errors are detected by measuring correlations. Threshold theorems prove that if individual error rates are below a threshold (~1%), arbitrarily long quantum computations are possible.' },
    { q: 'What programming languages are used?', a: 'Several quantum programming languages and frameworks exist: 1) Qiskit (IBM) - Python-based, most popular, 2) Cirq (Google) - Python framework for NISQ algorithms, 3) Q# (Microsoft) - standalone language with VS integration, 4) Pennylane - focuses on quantum machine learning, 5) Forest/Quil (Rigetti) - includes classical-quantum hybrid, 6) Amazon Braket - AWS quantum SDK. Most use Python interfaces and provide simulators for testing before running on actual quantum hardware.' },
    { q: 'How do I get started learning quantum computing?', a: 'To get started: 1) Prerequisites - linear algebra, complex numbers, basic probability, Python programming. 2) Free courses - IBM Qiskit Textbook, Microsoft Learn, Coursera quantum courses. 3) Hands-on - use IBM Quantum Experience (free cloud access), try tutorials on qiskit.org. 4) Books - "Quantum Computing: An Applied Approach" by Hidary, "Programming Quantum Computers" by Johnston. 5) Community - join Qiskit Slack, attend quantum hackathons. Start with simple circuits: superposition, entanglement, then move to algorithms.' },
    { q: 'What hardware do quantum computers use?', a: 'Quantum computer hardware varies by approach: 1) Superconducting qubits (IBM, Google) - tiny circuits cooled to near absolute zero, currently most advanced. 2) Trapped ions (IonQ, Honeywell) - individual atoms held by electromagnetic fields, excellent coherence. 3) Photonic (Xanadu, PsiQuantum) - uses light particles, can operate at room temperature. 4) Topological (Microsoft) - theoretical approach using anyons, more error-resistant. 5) Neutral atoms (QuEra) - arrays of atoms manipulated with lasers. Each has trade-offs in qubit count, coherence time, gate fidelity, and scalability.' },
  ];

  for (const topic of topics) {
    conversationHistory.push({
      role: 'user',
      content: topic.q,
      tokenCount: countTokens(topic.q),
      messageId: crypto.randomUUID(),
    });
    conversationHistory.push({
      role: 'assistant',
      content: topic.a,
      tokenCount: countTokens(topic.a),
      messageId: crypto.randomUUID(),
    });
  }

  console.log(`Configuration:`);
  console.log(`  Max context tokens: ${MAX_CONTEXT_TOKENS}`);
  console.log(`  Compression threshold: ${COMPRESSION_THRESHOLD * 100}%`);
  console.log(`  Threshold tokens: ${MAX_CONTEXT_TOKENS * COMPRESSION_THRESHOLD}`);
  console.log(`  Max summary tokens: ${MAX_SUMMARY_TOKENS}`);
  console.log(`  Total messages: ${conversationHistory.length}\n`);

  // Calculate total tokens in full conversation
  const fullConversationTokens = conversationHistory.reduce((sum, m) => sum + m.tokenCount, 0);
  console.log(`Full conversation tokens: ${fullConversationTokens}\n`);

  let previousSummary = '';
  let compressionCount = 0;

  // Process conversation, simulating message-by-message
  for (let i = 0; i < conversationHistory.length; i++) {
    const currentMessages = conversationHistory.slice(0, i + 1);
    let effectiveTokens;

    if (previousSummary) {
      // After compression: summary + new messages since last compression
      const summaryTokens = countTokens(previousSummary);
      const latestMsg = currentMessages[currentMessages.length - 1];
      effectiveTokens = summaryTokens + latestMsg.tokenCount;
    } else {
      effectiveTokens = currentMessages.reduce((sum, m) => sum + m.tokenCount, 0);
    }

    const percentage = Math.round((effectiveTokens / MAX_CONTEXT_TOKENS) * 100);
    const shouldCompress = effectiveTokens > MAX_CONTEXT_TOKENS * COMPRESSION_THRESHOLD && currentMessages.length > 1;

    if (shouldCompress) {
      compressionCount++;
      console.log(`\n🔥 COMPRESSION #${compressionCount} at message ${i + 1}`);
      console.log(`   Effective tokens: ${effectiveTokens} (${percentage}% of ${MAX_CONTEXT_TOKENS})`);

      // Format messages with recency markers
      const formattedMessages = currentMessages.map((msg, idx) => {
        const isRecent = idx >= currentMessages.length - RECENT_MESSAGE_COUNT;
        const marker = isRecent ? '[RECENT]' : '[OLD]';
        const role = msg.role === 'user' ? 'Human' : 'AI';
        return `${marker} ${role}: ${msg.content}`;
      }).join('\n');

      const prompt = await WEIGHTED_SUMMARY_PROMPT.format({
        previous_summary: previousSummary || 'No previous summary.',
        messages: formattedMessages,
      });

      console.log(`   Calling OpenRouter API...`);

      try {
        const summaryLLM = new ChatOpenAI({
          modelName: 'anthropic/claude-3-haiku',
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_KEY,
          },
          maxTokens: MAX_SUMMARY_TOKENS,
          temperature: 0.3,
        });

        const response = await summaryLLM.invoke(prompt);
        const summaryContent = response.content?.toString() || '';
        const summaryTokens = countTokens(summaryContent);

        previousSummary = summaryContent;

        const originalTokens = currentMessages.reduce((sum, m) => sum + m.tokenCount, 0);
        const tokensSaved = originalTokens - summaryTokens;
        const reductionPercent = Math.round((tokensSaved / originalTokens) * 100);

        console.log(`   ✅ Summary: ${summaryTokens} tokens`);
        console.log(`   📉 Saved: ${tokensSaved} tokens (${reductionPercent}% reduction)`);
        console.log(`   📝 "${summaryContent.substring(0, 100)}..."`);

      } catch (error) {
        console.log(`   ❌ API Error: ${error.message}`);
      }
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('=== FINAL RESULTS ===');
  console.log('='.repeat(60));
  console.log(`\nTotal messages in conversation: ${conversationHistory.length}`);
  console.log(`Full conversation tokens: ${fullConversationTokens}`);
  console.log(`Compression events: ${compressionCount}`);

  if (previousSummary) {
    const finalSummaryTokens = countTokens(previousSummary);
    const latestMsgTokens = conversationHistory[conversationHistory.length - 1].tokenCount;
    const finalPayloadTokens = finalSummaryTokens + latestMsgTokens;
    const totalSaved = fullConversationTokens - finalPayloadTokens;

    console.log(`\nFinal payload would be:`);
    console.log(`  [summary (${finalSummaryTokens} tokens) + latest_message (${latestMsgTokens} tokens)]`);
    console.log(`  = ${finalPayloadTokens} tokens total`);
    console.log(`\n🎯 TOTAL SAVINGS: ${totalSaved} tokens (${Math.round(totalSaved/fullConversationTokens*100)}% reduction)`);
    console.log(`   Instead of sending ${fullConversationTokens} tokens, we send ${finalPayloadTokens}!`);

    console.log('\n📜 FINAL SUMMARY:');
    console.log('-'.repeat(60));
    console.log(previousSummary);
    console.log('-'.repeat(60));
  }

  await mongoose.disconnect();
  console.log('\n✓ Test complete!');
}

testRealisticSummarization().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
