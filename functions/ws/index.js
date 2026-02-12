
// This file is no longer needed - WebSocket handling is now in _middleware.js
export default {
  async fetch(request, env, ctx) {
    return new Response('WebSocket endpoint moved to _middleware.js');
  }
};
