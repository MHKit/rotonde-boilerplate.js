'use strict'

const _ = require('lodash');

const client = require('rotonde-client/node/rotonde-client')('ws://bionicodevkit.local:4224');

// ===================
// Code pour la reception d'un evenement MYO_POSE_EDGE

client.eventHandlers.attach('MYO_POSE_EDGE', (event) => {
  console.log(event.identifier);

  // Inserer ici le code de control de la main
});

// ===================

client.onReady(() => {
  console.log('Connected');
});

client.connect();
