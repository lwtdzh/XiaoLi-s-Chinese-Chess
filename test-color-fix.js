const API_BASE = 'https://chinachess.pages.dev';

async function test() {
  console.log('=== Testing Player Color Assignment Fix ===\n');
  
  // Create room
  console.log('1. Creating room...');
  const createRes = await fetch(`${API_BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName: 'color-test', playerName: 'Player1' })
  });
  const createData = await createRes.json();
  console.log('   Player 1 color:', createData.color);
  const roomId = createData.roomId;
  
  // Join room
  console.log('\n2. Second player joining...');
  const joinRes = await fetch(`${API_BASE}/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName: 'Player2' })
  });
  const joinData = await joinRes.json();
  console.log('   Player 2 color:', joinData.color);
  
  // Verify colors are different
  console.log('\n=== Result ===');
  if (createData.color !== joinData.color) {
    console.log('✅ PASS: Players have different colors');
    console.log(`   Player 1: ${createData.color}`);
    console.log(`   Player 2: ${joinData.color}`);
  } else {
    console.log('❌ FAIL: Both players have same color:', createData.color);
  }
}

test().catch(console.error);
