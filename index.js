'use strict'

const _ = require('lodash');

const client = require('rotonde-client/node/rotonde-client')('ws://bionicodevkit.local:4224');

// ===================
// Code pour la reception d'un evenement MYO_POSE_EDGE

client.eventHandlers.attach('MYO_POSE_EDGE', (event) => {
  console.log(event.identifier);

  // Inserer ici le code de control de la main
  if (event.data.pose == 'wave_right') {
    client.sendAction('HAND_FINGERS', { // même structure que le champs data du paquet envoyé via l'extension chrome
      "fingers": [
        {"position": 0, "speed": 1},
        {"position": 0, "speed": 1},
        {"position": 0, "speed": 1},
        {"position": 0, "speed": 1},
        {"position": 0, "speed": 1}
      ]
    });
  } else {
    client.sendAction('HAND_FINGERS', { // comme le cas précédent, sauf que les positions sont à 1
      "fingers": [
        {"position": 1, "speed": 1},
        {"position": 1, "speed": 1},
        {"position": 1, "speed": 1},
        {"position": 1, "speed": 1},
        {"position": 1, "speed": 1}
      ]
    });
  }
});

// ===================
client.onReady(() => {
  console.log('Connected');
});

client.connect();
