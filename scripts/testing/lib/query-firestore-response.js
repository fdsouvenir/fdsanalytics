#!/usr/bin/env node
/**
 * Query Firestore for assistant response by threadId
 *
 * Usage: node query-firestore-response.js <threadId>
 * Returns: JSON with {found: boolean, content: string, timestamp: string}
 */

const { Firestore } = require('@google-cloud/firestore');

// Parse command line arguments
const threadId = process.argv[2];

if (!threadId) {
  console.error(JSON.stringify({
    found: false,
    error: 'Usage: node query-firestore-response.js <threadId>'
  }));
  process.exit(1);
}

async function queryResponse(threadId) {
  const firestore = new Firestore({
    projectId: 'fdsanalytics'
  });

  const collection = firestore.collection('conversation_messages');

  try {
    // Query for messages in this thread (simple query to avoid index requirement)
    const snapshot = await collection
      .where('threadId', '==', threadId)
      .get();

    if (snapshot.empty) {
      return {
        found: false,
        content: '',
        timestamp: null,
        error: `No messages found for thread: ${threadId}`
      };
    }

    // Filter and sort in memory to avoid Firestore index requirement
    const assistantMessages = snapshot.docs
      .map(doc => doc.data())
      .filter(data => data.role === 'assistant')
      .sort((a, b) => {
        const timeA = a.timestamp ? a.timestamp.toMillis() : 0;
        const timeB = b.timestamp ? b.timestamp.toMillis() : 0;
        return timeB - timeA; // DESC order
      });

    if (assistantMessages.length === 0) {
      return {
        found: false,
        content: '',
        timestamp: null,
        error: `No assistant response found for thread: ${threadId}`
      };
    }

    const data = assistantMessages[0];

    return {
      found: true,
      content: data.content || '',
      timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null,
      conversationId: data.conversationId
    };
  } catch (error) {
    return {
      found: false,
      content: '',
      timestamp: null,
      error: `Firestore query failed: ${error.message}`
    };
  }
}

// Main execution
queryResponse(threadId)
  .then(result => {
    console.log(JSON.stringify(result));
    process.exit(result.found ? 0 : 1);
  })
  .catch(error => {
    console.error(JSON.stringify({
      found: false,
      error: error.message
    }));
    process.exit(1);
  });
