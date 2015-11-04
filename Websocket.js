/**
 * 
 */
var util = require('util');
var events = require('events');
var request = require('request');
var fs = require('fs');
var os = require('os');
var WsWebSocket = require('ws');
var uuid = require('node-uuid');
var LOG = require("./Log").newInstance();
require('ssl-root-cas/latest')
	.inject();


var WEBSOCKET_TIMER = 10000; // 10 secondes
var HTTP_TIMEOUT = 10000; // 10 secondes

/**
 * Constructeur Websocket
 */
var Websocket = function Websocket() {
	this.token = null;
	this.username = null;
	this.applicationKey = null;
	this.applicationHost = null;
	this.websocketUrl = null;
	this.ws = null;
	this.agentModel = null;
	this.subscribing = false;
	
	this.onMessage = null;
	this.onConnected = null;
	
	var websocket = this;
	
	websocket.on('subscribe', function() {
		websocket.subscribe();
	});

	websocket.on('websocket', function() {
		websocket.websocket();
	});
	
	websocket.on('sendMessage', function(message) {
		websocket.sendMessage(message);
	});
};

util.inherits(Websocket, events.EventEmitter);


/**
 * Point d'entrée pour le websocket
 * Démarre un callback pour vérifier l'état du websocket
 * si fermé relance une souscription et une connexion au websocket
 */
Websocket.prototype.listen = function() {
	var websocket = this;
	
	websocket.emit('subscribe');
	
	setInterval(function() {
		if (!websocket.ws || websocket.ws == WsWebSocket.CLOSED) {
			if (!websocket.subscribing) {
				LOG.info(websocket, 'Channel is closed : try reconnecting...');
				websocket.emit('subscribe');
			} else {
				LOG.info(websocket, 'Channel is closed but current subscribing');
			}
		}
	}, WEBSOCKET_TIMER);
}


/**
 * Connexion à l'application SmartHome pour s'authentifier
 * et récupérer un token de connexion pour le websocket
 */
Websocket.prototype.subscribe = function() {
	LOG.info(this, "Subscribe for new token...");
	var websocket = this;
	
	if (this.credential()) {
		websocket.subscribing = true;
		
		var options = {
			url: this.applicationHost + '/agent/subscribe',
			method: 'POST',
			timeout: HTTP_TIMEOUT,
			formData: {
				username: this.username,
				applicationKey: this.applicationKey,
				mac: this.mac,
				privateIp: this.address,
				agentModel: this.agentModel,
			}
		};
		
		function subscribeCallBack(error, response, body) {
			if (response && response.statusCode == 200) {
				var token = null;
				
				try {
					token = JSON.parse(body);
				} catch (ex) {
					LOG.error(websocket, 'Subscribe response not valid !', body);
				}
				
				if (token) {
					// le service nous renvoit un token pour le websocket ainsi que son URL
					websocket.token = token.token;
					websocket.websocketUrl = token.websocketUrl;
					
					if (websocket.token && websocket.websocketUrl) {
						LOG.info(websocket, 'Subscribe find new token : try openning channel');
						websocket.emit('websocket');
						return true;
					} else {
						LOG.error(websocket, 'Subscribe incomplete : no token or websocketUrl !');
					}
				}
			}
			
			// arrivé là y'a eu une erreur plus haut
			LOG.error(websocket, 'Subscribe request error', error);
			websocket.subscribing = false;
		};
		
		request(options, subscribeCallBack);
	}
};


/**
 * Récupère dans un fichier les infos de connexion
 * à l'application SmartHome
 * 
 * @return true si les infos obligatoires sont présentes
 */
Websocket.prototype.credential = function() {
	LOG.info(this, "Credential loading...");
	var buffer = null;
	
	try {
		buffer = fs.readFileSync(__dirname + '/smarthome.credentials');
	} catch (ex) {
		LOG.error(this, 'Credential reading file', ex);
		return false;
	}
	
	if (buffer) {
		var credentials = JSON.parse(buffer);
			
		if (credentials) {
			this.username = credentials.username;
			this.applicationKey = credentials.applicationKey;
			this.applicationHost = credentials.applicationHost;
			this.agentModel = credentials.agentModel;
			
			var network = os.networkInterfaces();
			LOG.info(this, 'Find network interface', network);
			
			if (network.eth0) {
				this.mac = network.eth0[0].mac;
				this.address = network.eth0[0].address;
				// pas d'info mac sur nodejs v0.10. donc il faut le rajouter dans les credentials
				if (!this.mac) {
					LOG.info(this, 'No mac from os.networkInterfaces(). Try get it from credential...');
					this.mac = credentials.mac; 
				}
				
				if (!this.mac) {
					throw new Exception("Mac must be specified in credential file !");
				}
				
				return this.username && this.applicationKey && this.applicationHost && this.mac;
			} else {
				LOG.error(this, 'No ethernet interface');
			}
		} else {
			LOG.error(this, 'Error format JSON');
		}
	} else {
		LOG.error(this, 'Credential file is empty !');
	}
	
	return false;
};


/**
 * Libère les réssources et ferme le websocket
 */
Websocket.prototype.close = function() {
	LOG.info(this, 'Closing channel...');
	this.subscribing = false;
	
	if (this.ws) {
		this.ws.close();
		this.ws = null;
	}
};


/**
 * Envoit un message via le websocket
 * Le message est encapsulé dans un obet JSON pour
 * y ajouter les infos de connexion
 * 
 * @param message
 */
Websocket.prototype.sendMessage = function(message, onerror) {
	var websocket = this;
	
	if (this.ws) {
		var data = {
				mac: this.mac,
				token: this.token,
				applicationKey: this.applicationKey,
				username: this.username,
				data: message
		};
		
		var jsonData = JSON.stringify(data);
		
		this.ws.send(jsonData, function ack(error) {
			if (error) {
				LOG.error(websocket, 'sendMessage error', error);
				if (onerror) {
					onerror(error, message);
				}
			} else {
				LOG.info(websocket, 'sendMessage complete', [message]);
			}
		});
	} else if (onerror) {
		onerror('Websocket not connected !', message);
	}
};


/**
 * Ouvre un websocket avec l'application SmartHome
 * Reste à l'écoute des messages depuis le websocket
 */
Websocket.prototype.websocket = function() {
	LOG.info(this, "Openning channel...", this.websocketUrl);
	
	if (this.token && this.websocketUrl) {
		var websocket = this;
		
		try {
			this.ws = new WsWebSocket(this.websocketUrl);
		} catch (ex) {
			LOG.error(websocket, 'URL not valid', ex);
			websocket.close();
			return;
		}
		
		this.ws.on('close', function(code, message) {
			LOG.info(websocket, 'Channel disconnected !', code, message);
			websocket.close();
		});
		
		this.ws.on('open', function() {
			LOG.info(websocket, 'Channel connected !');
			websocket.subscribing = false;
			// vérifie que le channel fonctionne
			websocket.sendMessage({header: 'Hello'});
			
			if (websocket.onConnected) {
				websocket.onConnected();
			}
		});
		
		this.ws.on('error', function(error) {
			LOG.error(websocket, 'Channel error', error);
			websocket.close();
		});
		
		this.ws.on('message', function message(data, flags) {
			LOG.info(websocket, 'Receiving data...');
			
			// le message doit contenir dans son entete les infos de connexion.
			// evite de repondre à des messages externes même si pas possible car websocket connecté à appli smarthome
			var message = null
			
			try {
				message = JSON.parse(data)
			} catch (ex) {
				LOG.error(websocket, "Message not valid !");
				return;
			}
			
			if (message.applicationKey == websocket.applicationKey && message.username == websocket.username &&
					message.mac == websocket.mac && message.token == websocket.token) {
				if (websocket.onMessage && message.data) {
					websocket.onMessage(message.data);
				}
			} else {
				LOG.error(websocket, "Authentification header error !");
			}
		});
	} else {
		// il manque des infos, il faut récupérer le token
		websocket.close();
	}
}



module.exports.Websocket = Websocket;
module.exports.newInstance = function() {
	return new Websocket();
};
