
export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Handle WebSocket upgrade
  if (url.pathname === '/ws') {
    return handleWebSocket(context);
  }
  
  // Serve static files
  return context.next();
}

async function handleWebSocket(context) {
  const upgradeHeader = context.request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 426 });
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  server.serialize({
    server,
    env: context.env
  });

  return new Response(null, {
    status: 101,
    webSocket: client
  });
}
