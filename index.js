'use strict'

const client = require('rotonde-client/node/rotonde-client')('ws://127.0.0.1:4224');

client.onReady(() => {
  console.log('Connected');
});

client.connect();
