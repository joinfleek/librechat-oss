/**
 * End-to-end API test for checkpoint-based summarization
 * Tests the actual LibreChat /api/agents/chat endpoint
 * Run with: node test-api-summarization.js
 */

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const EventSource = require('eventsource');

const BASE_URL = 'http://localhost:3080';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/LibreChat';

// Generate a valid JWT token for testing
function generateTestToken(userId) {
  const secret = process.env.JWT_SECRET || 'test';
  return jwt.sign(
    {
      id: userId,
      username: 'test-user',
      provider: 'local',
      email: 'test@test.com',
    },
    secret,
    { expiresIn: '1h' }
  );
}

// Send a chat message and wait for response
async function sendChatMessage(token, agentId, message, conversationId = null, parentMessageId = null) {
  const body = {
    text: message,
    endpoint: 'agents',
    agent_id: agentId,
    model_parameters: {},
  };

  if (conversationId) {
    body.conversationId = conversationId;
  }
  if (parentMessageId) {
    body.parentMessageId = parentMessageId;
  }

  return new Promise((resolve, reject) => {
    let fullResponse = '';
    let responseData = null;

    const url = `${BASE_URL}/api/agents/chat`;

    // Use fetch with streaming
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`HTTP ${response.status}: ${error}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                // Debug first few parsed messages
                if (!fullResponse && parsed) {
                  console.log('     [DEBUG] First parsed:', JSON.stringify(parsed).substring(0, 200));
                }
                if (parsed.text) {
                  fullResponse += parsed.text;
                }
                if (parsed.message) {
                  fullResponse += parsed.message;
                }
                if (parsed.final || parsed.responseMessage) {
                  responseData = parsed.responseMessage || parsed;
                }
                if (parsed.conversationId) {
                  responseData = responseData || {};
                  responseData.conversationId = parsed.conversationId;
                }
                if (parsed.messageId) {
                  responseData = responseData || {};
                  responseData.messageId = parsed.messageId;
                }
              } catch (e) {
                // Ignore parse errors for partial data
              }
            }
          }
        }

        resolve({
          text: fullResponse,
          conversationId: responseData?.conversationId,
          messageId: responseData?.messageId,
          parentMessageId: responseData?.parentMessageId,
        });
      })
      .catch(reject);
  });
}

async function testAPISummarization() {
  console.log('=== E2E API Checkpoint Summarization Test ===\n');

  // Connect to MongoDB
  console.log('1. Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('   Connected!\n');

  // Use existing user who owns the agent
  const User = mongoose.connection.collection('users');
  const user = await User.findOne({ email: 'snktagarwal@gmail.com' });

  if (!user) {
    console.log('   ❌ No test user found.');
    await mongoose.disconnect();
    return;
  }

  // Clear any bans for this user
  const Logs = mongoose.connection.collection('logs');
  await Logs.deleteMany({ key: { $regex: /BANS|ban/i } });
  console.log(`2. Using user: ${user.email} (${user._id}) - cleared bans\n`);

  // Generate JWT token
  const token = generateTestToken(user._id.toString());
  console.log('3. Generated JWT token\n');

  // Get an agent
  const Agent = mongoose.connection.collection('agents');
  const agent = await Agent.findOne({ provider: 'OpenRouter' });

  if (!agent) {
    console.log('   ❌ No OpenRouter agent found.');
    await mongoose.disconnect();
    return;
  }

  console.log(`4. Using agent: ${agent.name} (${agent.id})\n`);
  console.log(`   Model: ${agent.model}\n`);

  // Check server health
  console.log('5. Checking server health...');
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    if (!healthRes.ok) {
      throw new Error('Server not responding');
    }
    console.log('   Server is running!\n');
  } catch (e) {
    console.log('   ❌ Server not running at', BASE_URL);
    console.log('   Please start the server with: npm run dev\n');
    await mongoose.disconnect();
    return;
  }

  // Find existing conversation with high token count to trigger compression
  const Message = mongoose.connection.collection('messages');

  // Get conversation with most tokens
  const topConvo = await Message.aggregate([
    { $group: {
      _id: '$conversationId',
      totalTokens: { $sum: '$tokenCount' },
      messageCount: { $sum: 1 }
    }},
    { $sort: { totalTokens: -1 }},
    { $limit: 1 }
  ]).toArray();

  if (!topConvo.length || topConvo[0].totalTokens < 10000) {
    console.log('   ❌ No conversation with enough tokens found');
    await mongoose.disconnect();
    return;
  }

  let conversationId = topConvo[0]._id;
  console.log(`6. Using existing conversation with ${topConvo[0].totalTokens} tokens\n`);
  console.log(`   ConvoID: ${conversationId}\n`);

  // Get the last message to use as parent
  const lastMessage = await Message.findOne(
    { conversationId },
    { sort: { createdAt: -1 } }
  );
  let parentMessageId = lastMessage?.messageId;
  console.log(`   Last message ID: ${parentMessageId}\n`);

  // Send multiple messages to observe checkpoint behavior
  console.log('7. Sending messages to observe checkpoint behavior...\n');

  const testMessages = [
    'Give me a very detailed analysis of the AI strategy in Fleek. Include all numbers, projections, and strategic implications. Be thorough.',
    'Now analyze the unit economics in extreme detail. Include CAC, LTV, payback periods, and how they change over time.',
    'What are all the risk factors? List every single one with detailed explanations.',
    'Compare Fleek to similar B2B marketplace companies. What makes it unique?',
    'Give me a final comprehensive investment thesis with all the pros and cons.',
    'Summarize all the key financial metrics in a detailed table format.',
    'What would need to happen for Fleek to become a billion dollar company?',
    'Analyze the competitive landscape and market dynamics in detail.',
  ];

  for (let i = 0; i < testMessages.length; i++) {
    console.log(`\n   === Message ${i + 1}/${testMessages.length} ===`);
    console.log(`   User: "${testMessages[i].substring(0, 60)}..."`);

    // Check checkpoints before this message
    const checkpointsBefore = await Message.countDocuments({
      conversationId,
      summary: { $exists: true, $ne: null },
    });

    try {
      const response = await sendChatMessage(
        token,
        agent.id,
        testMessages[i],
        conversationId,
        parentMessageId
      );

      parentMessageId = response.messageId;
      console.log(`   Assistant response length: ${(response.text || '').length} chars`);

      // Check checkpoints after this message
      const checkpointsAfter = await Message.countDocuments({
        conversationId,
        summary: { $exists: true, $ne: null },
      });

      if (checkpointsAfter > checkpointsBefore) {
        console.log(`   🔖 NEW CHECKPOINT CREATED! (Total: ${checkpointsAfter})`);
      } else {
        console.log(`   📝 No new checkpoint (Total: ${checkpointsAfter})`);
      }

      // Get current token count
      const tokenStats = await Message.aggregate([
        { $match: { conversationId } },
        { $group: { _id: null, totalTokens: { $sum: '$tokenCount' }, count: { $sum: 1 } } }
      ]).toArray();

      console.log(`   Current conversation: ${tokenStats[0]?.count} messages, ${tokenStats[0]?.totalTokens} tokens`);
      console.log('');

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
      break;
    }
  }

  // Check for checkpoint in database
  console.log('8. Final checkpoint status...\n');

  if (conversationId) {
    const messagesWithSummary = await Message.find({
      conversationId,
      summary: { $exists: true, $ne: null },
    }).toArray();

    if (messagesWithSummary.length > 0) {
      console.log(`   ✅ Found ${messagesWithSummary.length} checkpoint(s)!\n`);

      for (const msg of messagesWithSummary) {
        console.log(`   Message ID: ${msg.messageId}`);
        console.log(`   Summary tokens: ${msg.summaryTokenCount}`);
        console.log(`   Summary preview: "${msg.summary.substring(0, 150)}..."`);
        console.log('');
      }
    } else {
      console.log('   ⚠ No checkpoints found. Compression may not have triggered.');
      console.log('   This could mean:');
      console.log('   - Total tokens didn\'t reach 50% of maxContextTokens');
      console.log('   - summarize: true is not set in librechat.yaml');
      console.log('');

      // Show message token counts
      const allMessages = await Message.find({ conversationId }).toArray();
      const totalTokens = allMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
      console.log(`   Total messages: ${allMessages.length}`);
      console.log(`   Total tokens in conversation: ${totalTokens}`);
    }
  }

  await mongoose.disconnect();
  console.log('✓ Test complete!');
}

testAPISummarization().catch(err => {
  console.error('Test failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
