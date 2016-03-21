'use strict';

const
  Promise = require('promise'),
  WebSocket = require('websocket').w3cwebsocket,
  _ = require('lodash');

// stores and indexes definitions
const newDefinitionsStore = () => {
  const definitions = [];

  // definitions indexing
  let definitionsByIdentifier = {};

  return {
    forEach(fn) {
      _.forEach(definitions, fn);
    },

    getDefinition(identifier) {
      const definition = definitionsByIdentifier[identifier];

      if (_.isUndefined(definition)) {
        console.log('Unknown Definition Exception -> ' + identifier);
      }
      return definition;
    },

    addDefinition(definition) {
      const d = definitionsByIdentifier[definition.identifier];
      if (d) {
        const index = _.indexOf(definitions, d);
        const fields = _.uniq(_.union(d.fields, definition.fields), function(field) {
          return field.name;
        });
        definition.fields = fields;
        definitions[index] = definition;
      } else {
        definitions.push(definition);
      }

      // update indexes
      definitionsByIdentifier = _.indexBy(definitions, 'identifier');
    },

    removeDefinition(identifier) {
      const index = _.indexOf(definitions, identifier);
      if (index < 0) {
        return;
      }
      definitions.splice(index, 1);

      definitionsByIdentifier = _.indexBy(definitions, 'identifier');
    },
  };
};

// stores handlers by identifier, can auto remove handlers after n calls.
// callbacks can be passed to this function, they will be called when a given identifier gets its first handler,
// or when a given identifier removed its last handler
const newHandlerManager = (firstAddedCallback, lastRemovedCallback) => {

  const handlers = new Map();

  const detachAtIndex = function(identifier, index) {
    const h =  handlers[identifier];
    h.splice(index--, 1);

    if (h.length == 0) {
      handlers[identifier] = undefined;
      if (lastRemovedCallback) {
        lastRemovedCallback(identifier);
      }
    }
  };

  return {

    makePromise(identifier, timeout) {
      return new Promise((resolve, reject) => {
        let timer;
        const fn = (data) => {
          resolve(data);
          if (timer) {
            clearTimeout(timer);
          }
        };

        this.attachOnce(identifier, fn);

        if (!timeout) {
          return;
        }

        timer = setTimeout(_.bind(() => {
          this.detach(identifier, fn);
          // TODO setup proper error handling wih error codes
          reject('time out ' + identifier);
        }, this), timeout);

      });
    },

    callHandlers(identifier, param) {
      // Dispatch events to their callbacks
      const callHandlers = (h) => {
        for (let i = 0; i < h.length; i++) {
          const callback  = h[i][0];
          const callCount = h[i][1];

          if (callCount > 0) {  // it's not a permanent callback
            if (--h[i][1] == 0) { // did it consumed all its allowed calls ?
              console.log('Detaching consumed callback from ' + identifier);
              detachAtIndex(identifier, i);
            }
          }
          callback(param);
        }
      }
      if (handlers[identifier]) {
        callHandlers(handlers[identifier]);
      }
      if (handlers['*']) {
        callHandlers(handlers['*']);
      }
    },

    registeredIdentifiers() {
      return _.keys(handlers);
    },

    attach(identifier, callback, callCount) {
      if (callCount == undefined)
        callCount = -1;

      if (handlers[identifier] === undefined) {
        handlers[identifier] = [];

        if (firstAddedCallback) {
          firstAddedCallback(identifier);
        }
      }
      handlers[identifier].push([callback, callCount]);
    },

    detach(identifier, callback) {
      if (handlers[identifier]) {
        const h = handlers[identifier];

        for (let i = 0; i < h.length; i++) {
          const cb  = h[i][0];
          if (cb == callback) {
            detachAtIndex(identifier, i);
          }
        }
      }
    },

    detachAll() {
      for(let identifier of handlers.keys()) {
        for(let i = 0; i < handlers[identifier].length; i++) {
          detachAtIndex(identifier, i);
        }
      }
    },

    attachOnce(identifier, callback) {
      this.attach(identifier, callback, 1);
    },

    each(func) {
      _.forEach(_.keys(handlers), func);
    }
  }
};

// Abstracts a websocket to send javascript objects as skybot JSON protocol
const newRotondeConnection = function(url, ready, onmessage) {
  let connected = false;
  const socket = new WebSocket(url);

  socket.onmessage = onmessage;

  const PACKET_TYPES = {
    ACTION: 'action',
    EVENT: 'event',
    DEFINITION: 'def',
    UNDEFINITION: 'undef',
    SUBSCRIBE: 'sub',
    UNSUBSCRIBE: 'unsub'
  }

  socket.onopen = (event) => {
    connected = true;
    ready();
  };

  socket.onerror = function() {
    console.log('Connection failed.');
  };

  return {
    PACKET_TYPES,

    isConnected() {
      return connected;
    },

    sendEvent(identifier, data) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.EVENT,
        payload: {
          identifier,
          data,
        },
      }));
    },

    sendAction(identifier, data) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.ACTION,
        payload: {
          identifier,
          data,
        },
      }));
    },

    sendDefinition(definition) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.DEFINITION,
        payload: definition,
      }));
    },

    sendUnDefinition(unDefinition) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.UNDEFINITION,
        payload: unDefinition,
      }));
    },

    sendSubscribe(identifier) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.SUBSCRIBE,
        payload: {
          identifier,
        },
      }));
    },

    sendUnsubscribe(identifier) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.UNSUBSCRIBE,
        payload: {
          identifier,
        },
      }));
    }
  }
}


module.exports = (url) => {

  let connection;

  const localDefinitions = {action: newDefinitionsStore(), event: newDefinitionsStore()};
  const remoteDefinitions = {action: newDefinitionsStore(), event: newDefinitionsStore()};

  const searchDefinitions = (definitionsStore, identifier) => {
    return _.compact([definitionsStore['action'].getDefinition(identifier), definitionsStore['event'].getDefinition(identifier)]);
  };

  const eventHandlers = newHandlerManager((identifier) => {
    if (identifier == '*') {
      return;
    }
    if (isConnected()) {
      connection.sendSubscribe(identifier);
    }
  }, (identifier) => {
    if (identifier == '*') {
      return;
    }
    if (isConnected()) {
      connection.sendUnsubscribe(identifier);
    }
  });
  const actionHandlers = newHandlerManager(() => {}, () => {});
  const definitionHandlers = newHandlerManager(() => {}, () => {});
  const unDefinitionHandlers = newHandlerManager(() => {}, () => {});

  const readyCallbacks = [];

  const isConnected = () => {
    return connection && connection.isConnected();
  };

  const getRemoteDefinition = (type, identifier) => remoteDefinitions[type].getDefinition(identifier);
  const getLocalDefinition = (type, identifier) => localDefinitions[type].getDefinition(identifier);;

  const addLocalDefinition = (type, identifier, fields, isarray) => {
    const definition = {
      identifier,
      type,
      fields,
      isarray: isarray || false
    };
    localDefinitions[type].addDefinition(definition);
    if (isConnected()) {
      connection.sendDefinition(definition);
    }
  };

  const removeLocalDefinition = (type, identifier) => {
    const definition = localDefinitions[type].getDefinition(identifier);
    if (!definition) {
      return;
    }
    localDefinitions[type].removeDefinition(identifier);
    if (isConnected()) {
      connection.sendUnDefinition(definition);
    }
  };

  const connect = () => {
    connection = newRotondeConnection(url, () => {
      _.forEach(readyCallbacks, (readyCallback) => {
        readyCallback();
      });

      // send subsribe for all already registered updateHandlers
      eventHandlers.each((identifier) => {
        connection.sendSubscribe(identifier);
      });

      // send local definitions
      _.forEach(['action', 'event'], (type) => {
        localDefinitions[type].forEach((definition) => {
          connection.sendDefinition(definition);
        })
      });
    }, handleMessage);
  };

  const handleMessage = (event) => {
    const packet = JSON.parse(event.data);

    if (packet.type == connection.PACKET_TYPES.EVENT) {
      const event = packet.payload;
      const identifier = event.identifier;

      console.log('received event: ' + identifier);
      eventHandlers.callHandlers(identifier, event);
    } else if (packet.type == connection.PACKET_TYPES.ACTION) {
      const action = packet.payload;
      const identifier = action.identifier;

      console.log('received action: ' + identifier);
      actionHandlers.callHandlers(identifier, action);
    } else if (packet.type == connection.PACKET_TYPES.DEFINITION) {
      const definition = packet.payload;

      console.log('received definition: ' + definition.identifier + ' ' + definition.type);
      remoteDefinitions[definition.type].addDefinition(definition);
      definitionHandlers.callHandlers(definition.identifier, definition);

      if (definition.type == 'event') {
        // if there were registered update handlers, we send a subscribe
        if (_.contains(eventHandlers.registeredIdentifiers(), definition.identifier)) {
          connection.sendSubscribe(definition.identifier);
        }
      }
    } else if (packet.type == connection.PACKET_TYPES.UNDEFINITION) {
      const unDefinition = packet.payload;

      console.log('received unDefinition: ' + unDefinition.identifier + ' ' + unDefinition.type);
      remoteDefinitions[unDefinition.type].removeDefinition(unDefinition.identifier);
      unDefinitionHandlers.callHandlers(unDefinition.identifier, unDefinition);
    }
  };

  const onReady = (callback) => {
    if (isConnected()) {
      callback();
      return;
    }
    readyCallbacks.push(callback);
  };

  const requireDefinitions = (identifiers, timeout) => {
    const promises = identifiers.map((identifier) => {
      return definitionHandlers.makePromise(identifier, timeout);
    });
    return Promise.all(promises);
  };

  const bootstrap = (actions, events, defs, timeout) => {
    const missingDefs = _.uniq(_.union(_.keys(actions), events, defs).reduce((current, identifier) => {
      if (searchDefinitions(remoteDefinitions, identifier).length > 0) {
        return current;
      }
      current.push(identifier);
      return current;
    }, []));

    const promises = () => {
      const eventPromises = events.map((identifier) => {
        return eventHandlers.makePromise(identifier, timeout);
      });
      _.forEach(actions, (action, identifier) => {
        connection.sendAction(identifier, action);
      });
      return eventPromises;
    };

    if (missingDefs.length) {
      return requireDefinitions(missingDefs, timeout).then(() => Promise.all(promises()));
    }
    return Promise.all(promises());
  };

  return {
    addLocalDefinition,
    removeLocalDefinition,

    sendEvent: (identifier, data) => connection.sendEvent(identifier, data),
    sendAction: (identifier, data) => connection.sendAction(identifier, data),
    sendSubscribe: (identifier) => connection.sendSubscribe(identifier),
    sendUnsubscribe: (identifier) => connection.sendUnsubscribe(identifier),

    eventHandlers,
    actionHandlers,
    definitionHandlers,
    unDefinitionHandlers,

    getRemoteDefinition,
    getLocalDefinition,
    isConnected,
    connect,
    onReady,
    requireDefinitions,
    bootstrap,
  };
};
