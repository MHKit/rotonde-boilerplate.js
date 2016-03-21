'use strict';

var Promise = require('promise'),
    WebSocket = require('websocket').w3cwebsocket,
    _ = require('lodash');

// stores and indexes definitions
var newDefinitionsStore = function newDefinitionsStore() {
  var definitions = [];

  // definitions indexing
  var definitionsByIdentifier = {};

  return {
    forEach: function forEach(fn) {
      _.forEach(definitions, fn);
    },
    getDefinition: function getDefinition(identifier) {
      var definition = definitionsByIdentifier[identifier];

      if (_.isUndefined(definition)) {
        console.log('Unknown Definition Exception -> ' + identifier);
      }
      return definition;
    },
    addDefinition: function addDefinition(definition) {
      var d = definitionsByIdentifier[definition.identifier];
      if (d) {
        var index = _.indexOf(definitions, d);
        var fields = _.uniq(_.union(d.fields, definition.fields), function (field) {
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
    removeDefinition: function removeDefinition(identifier) {
      var index = _.indexOf(definitions, identifier);
      if (index < 0) {
        return;
      }
      definitions.splice(index, 1);

      definitionsByIdentifier = _.indexBy(definitions, 'identifier');
    }
  };
};

// stores handlers by identifier, can auto remove handlers after n calls.
// callbacks can be passed to this function, they will be called when a given identifier gets its first handler,
// or when a given identifier removed its last handler
var newHandlerManager = function newHandlerManager(firstAddedCallback, lastRemovedCallback) {

  var handlers = new Map();

  var detachAtIndex = function detachAtIndex(identifier, index) {
    var h = handlers[identifier];
    h.splice(index--, 1);

    if (h.length == 0) {
      handlers[identifier] = undefined;
      if (lastRemovedCallback) {
        lastRemovedCallback(identifier);
      }
    }
  };

  return {
    makePromise: function makePromise(identifier, timeout) {
      var _this = this;

      return new Promise(function (resolve, reject) {
        var timer = undefined;
        var fn = function fn(data) {
          resolve(data);
          if (timer) {
            clearTimeout(timer);
          }
        };

        _this.attachOnce(identifier, fn);

        if (!timeout) {
          return;
        }

        timer = setTimeout(_.bind(function () {
          _this.detach(identifier, fn);
          // TODO setup proper error handling wih error codes
          reject('time out ' + identifier);
        }, _this), timeout);
      });
    },
    callHandlers: function callHandlers(identifier, param) {
      // Dispatch events to their callbacks
      var callHandlers = function callHandlers(h) {
        for (var i = 0; i < h.length; i++) {
          var callback = h[i][0];
          var callCount = h[i][1];

          if (callCount > 0) {
            // it's not a permanent callback
            if (--h[i][1] == 0) {
              // did it consumed all its allowed calls ?
              console.log('Detaching consumed callback from ' + identifier);
              detachAtIndex(identifier, i);
            }
          }
          callback(param);
        }
      };
      if (handlers[identifier]) {
        callHandlers(handlers[identifier]);
      }
      if (handlers['*']) {
        callHandlers(handlers['*']);
      }
    },
    registeredIdentifiers: function registeredIdentifiers() {
      return _.keys(handlers);
    },
    attach: function attach(identifier, callback, callCount) {
      if (callCount == undefined) callCount = -1;

      if (handlers[identifier] === undefined) {
        handlers[identifier] = [];

        if (firstAddedCallback) {
          firstAddedCallback(identifier);
        }
      }
      handlers[identifier].push([callback, callCount]);
    },
    detach: function detach(identifier, callback) {
      if (handlers[identifier]) {
        var h = handlers[identifier];

        for (var i = 0; i < h.length; i++) {
          var cb = h[i][0];
          if (cb == callback) {
            detachAtIndex(identifier, i);
          }
        }
      }
    },
    detachAll: function detachAll() {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = handlers.keys()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var identifier = _step.value;

          for (var i = 0; i < handlers[identifier].length; i++) {
            detachAtIndex(identifier, i);
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    },
    attachOnce: function attachOnce(identifier, callback) {
      this.attach(identifier, callback, 1);
    },
    each: function each(func) {
      _.forEach(_.keys(handlers), func);
    }
  };
};

// Abstracts a websocket to send javascript objects as skybot JSON protocol
var newRotondeConnection = function newRotondeConnection(url, ready, onmessage) {
  var connected = false;
  var socket = new WebSocket(url);

  socket.onmessage = onmessage;

  var PACKET_TYPES = {
    ACTION: 'action',
    EVENT: 'event',
    DEFINITION: 'def',
    UNDEFINITION: 'undef',
    SUBSCRIBE: 'sub',
    UNSUBSCRIBE: 'unsub'
  };

  socket.onopen = function (event) {
    connected = true;
    ready();
  };

  socket.onerror = function () {
    console.log('Connection failed.');
  };

  return {
    PACKET_TYPES: PACKET_TYPES,

    isConnected: function isConnected() {
      return connected;
    },
    sendEvent: function sendEvent(identifier, data) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.EVENT,
        payload: {
          identifier: identifier,
          data: data
        }
      }));
    },
    sendAction: function sendAction(identifier, data) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.ACTION,
        payload: {
          identifier: identifier,
          data: data
        }
      }));
    },
    sendDefinition: function sendDefinition(definition) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.DEFINITION,
        payload: definition
      }));
    },
    sendUnDefinition: function sendUnDefinition(unDefinition) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.UNDEFINITION,
        payload: unDefinition
      }));
    },
    sendSubscribe: function sendSubscribe(identifier) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.SUBSCRIBE,
        payload: {
          identifier: identifier
        }
      }));
    },
    sendUnsubscribe: function sendUnsubscribe(identifier) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.UNSUBSCRIBE,
        payload: {
          identifier: identifier
        }
      }));
    }
  };
};

module.exports = function (url) {

  var connection = undefined;

  var localDefinitions = { action: newDefinitionsStore(), event: newDefinitionsStore() };
  var remoteDefinitions = { action: newDefinitionsStore(), event: newDefinitionsStore() };

  var searchDefinitions = function searchDefinitions(definitionsStore, identifier) {
    return _.compact([definitionsStore['action'].getDefinition(identifier), definitionsStore['event'].getDefinition(identifier)]);
  };

  var eventHandlers = newHandlerManager(function (identifier) {
    if (identifier == '*') {
      return;
    }
    if (isConnected()) {
      connection.sendSubscribe(identifier);
    }
  }, function (identifier) {
    if (identifier == '*') {
      return;
    }
    if (isConnected()) {
      connection.sendUnsubscribe(identifier);
    }
  });
  var actionHandlers = newHandlerManager(function () {}, function () {});
  var definitionHandlers = newHandlerManager(function () {}, function () {});
  var unDefinitionHandlers = newHandlerManager(function () {}, function () {});

  var readyCallbacks = [];

  var isConnected = function isConnected() {
    return connection && connection.isConnected();
  };

  var getRemoteDefinition = function getRemoteDefinition(type, identifier) {
    return remoteDefinitions[type].getDefinition(identifier);
  };
  var getLocalDefinition = function getLocalDefinition(type, identifier) {
    return localDefinitions[type].getDefinition(identifier);
  };;

  var addLocalDefinition = function addLocalDefinition(type, identifier, fields, isarray) {
    var definition = {
      identifier: identifier,
      type: type,
      fields: fields,
      isarray: isarray || false
    };
    localDefinitions[type].addDefinition(definition);
    if (isConnected()) {
      connection.sendDefinition(definition);
    }
  };

  var removeLocalDefinition = function removeLocalDefinition(type, identifier) {
    var definition = localDefinitions[type].getDefinition(identifier);
    if (!definition) {
      return;
    }
    localDefinitions[type].removeDefinition(identifier);
    if (isConnected()) {
      connection.sendUnDefinition(definition);
    }
  };

  var connect = function connect() {
    connection = newRotondeConnection(url, function () {
      _.forEach(readyCallbacks, function (readyCallback) {
        readyCallback();
      });

      // send subsribe for all already registered updateHandlers
      eventHandlers.each(function (identifier) {
        connection.sendSubscribe(identifier);
      });

      // send local definitions
      _.forEach(['action', 'event'], function (type) {
        localDefinitions[type].forEach(function (definition) {
          connection.sendDefinition(definition);
        });
      });
    }, handleMessage);
  };

  var handleMessage = function handleMessage(event) {
    var packet = JSON.parse(event.data);

    if (packet.type == connection.PACKET_TYPES.EVENT) {
      var _event = packet.payload;
      var identifier = _event.identifier;

      console.log('received event: ' + identifier);
      eventHandlers.callHandlers(identifier, _event);
    } else if (packet.type == connection.PACKET_TYPES.ACTION) {
      var action = packet.payload;
      var identifier = action.identifier;

      console.log('received action: ' + identifier);
      actionHandlers.callHandlers(identifier, action);
    } else if (packet.type == connection.PACKET_TYPES.DEFINITION) {
      var definition = packet.payload;

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
      var unDefinition = packet.payload;

      console.log('received unDefinition: ' + unDefinition.identifier + ' ' + unDefinition.type);
      remoteDefinitions[unDefinition.type].removeDefinition(unDefinition.identifier);
      unDefinitionHandlers.callHandlers(unDefinition.identifier, unDefinition);
    }
  };

  var onReady = function onReady(callback) {
    if (isConnected()) {
      callback();
      return;
    }
    readyCallbacks.push(callback);
  };

  var requireDefinitions = function requireDefinitions(identifiers, timeout) {
    var promises = identifiers.map(function (identifier) {
      return definitionHandlers.makePromise(identifier, timeout);
    });
    return Promise.all(promises);
  };

  var bootstrap = function bootstrap(actions, events, defs, timeout) {
    var missingDefs = _.uniq(_.union(_.keys(actions), events, defs).reduce(function (current, identifier) {
      if (searchDefinitions(remoteDefinitions, identifier).length > 0) {
        return current;
      }
      current.push(identifier);
      return current;
    }, []));

    var promises = function promises() {
      var eventPromises = events.map(function (identifier) {
        return eventHandlers.makePromise(identifier, timeout);
      });
      _.forEach(actions, function (action, identifier) {
        connection.sendAction(identifier, action);
      });
      return eventPromises;
    };

    if (missingDefs.length) {
      return requireDefinitions(missingDefs, timeout).then(function () {
        return Promise.all(promises());
      });
    }
    return Promise.all(promises());
  };

  return {
    addLocalDefinition: addLocalDefinition,
    removeLocalDefinition: removeLocalDefinition,

    sendEvent: function sendEvent(identifier, data) {
      return connection.sendEvent(identifier, data);
    },
    sendAction: function sendAction(identifier, data) {
      return connection.sendAction(identifier, data);
    },
    sendSubscribe: function sendSubscribe(identifier) {
      return connection.sendSubscribe(identifier);
    },
    sendUnsubscribe: function sendUnsubscribe(identifier) {
      return connection.sendUnsubscribe(identifier);
    },

    eventHandlers: eventHandlers,
    actionHandlers: actionHandlers,
    definitionHandlers: definitionHandlers,
    unDefinitionHandlers: unDefinitionHandlers,

    getRemoteDefinition: getRemoteDefinition,
    getLocalDefinition: getLocalDefinition,
    isConnected: isConnected,
    connect: connect,
    onReady: onReady,
    requireDefinitions: requireDefinitions,
    bootstrap: bootstrap
  };
};