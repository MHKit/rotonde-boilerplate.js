'use strict';

let newClient = require('../node/rotonde-client');

let client = newClient('ws://localhost:4224/');

let testaction = {
  identifier: 'testaction',
  data: {
    field1: 750497594.8804686,
    field2: 'string test',
    field3: false,
  },
};

client.addLocalDefinition('action', 'MY_ACTION', [
  {
    name: 'field1',
    type: 'number',
    unit: 'pouet',
  },
  {
    name: 'field2',
    type: 'string',
    unit: 'toto',
  },
]);

client.onReady(() => {
  client.bootstrap({testaction}, ['testevent'], [], 1000).then(() => {
    console.log('onready');
  }, (error) => {
    console.log('error', error);
    client.removeLocalDefinition('action', 'MY_ACTION');
  });
});

client.connect();
