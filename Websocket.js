/**
 * 
 */
var util = require('util');
var events = require('events');
var request = require('request');
var os = require('os');
var WsWebSocket = require('ws');
var uuid = require('node-uuid');
var LOG = require("./Log").newInstance();
require('ssl-root-cas/latest')
	.inject();


var VERIF_WEBSOCKET_TIMER = 5000; // 5 secondes
var PING_WEBSOCKET_TIMER = 60000; // 60 secondes
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
	this.credentials = null;
	this.lastPing = new Date();
	this.pongTimeout = null
	this.connected = false
	
	this.onMessage = null;
	this.onConnected = null;
	this.onClosed = null;
	
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
		if (!websocket.connected) {
			if (!websocket.subscribing) {
				websocket.emit('subscribe');
			}
		} else {
			// le websocket est connecté mais si pas d'activité, la connexion peut être perdue
			// envoi d'un message fictif ping
			// on ne lance pas le ping si il y a un pong en attente
			if (!websocket.pongTimeout) {
				var now = new Date();
				
				if ((now.getTime() - websocket.lastPing.getTime()) > PING_WEBSOCKET_TIMER) {
					websocket.sendMessage({header: 'ping'});
					websocket.lastPing = now
					
					// creation d'un timeout pour attendre le pong
					// et fermer la connexion si pas de reponse
					websocket.pongTimeout = setTimeout(function() {
						LOG.error(websocket, "Ping no receive pong !")
						websocket.close()
					}, HTTP_TIMEOUT)
				}
			}
		}
	}, VERIF_WEBSOCKET_TIMER);
}


/**
 * Connexion à l'application SmartHome pour s'authentifier
 * et récupérer un token de connexion pour le websocket
 */
Websocket.prototype.subscribe = function() {
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
	if (this.credentials) {
		this.username = this.credentials.username;
		this.applicationKey = this.credentials.applicationKey;
		this.applicationHost = this.credentials.applicationHost;
		this.agentModel = this.credentials.agentModel;
		this.mac = this.credentials.mac; 
		
		var network = os.networkInterfaces();
		
		if (network.eth0 || network.wlan0) {
			this.address = network.eth0 ? network.eth0[0].address : network.wlan0[0].address;
			LOG.info(this, 'Find network interface', this.address);
			
			// pas d'info mac sur nodejs v0.10. donc il faut le rajouter dans les credentials
			if (!this.mac) {
				LOG.info(this, 'No mac from credential. Try get it from network...');
				this.mac = network.eth0 ? network.eth0[0].mac : network.wlan0[0].mac;
			}
			
			if (!this.mac) {
				throw new Exception("Mac must be specified in credential file !");
			}
			
			return this.username && this.applicationKey && this.applicationHost && this.mac;
		} else {
			LOG.error(this, 'No ethernet interface');
		}
	} else {
		LOG.error(this, 'Credentials empty !');
	}
};


/**
 * Libère les réssources et ferme le websocket
 */
Websocket.prototype.close = function() {
	LOG.info(this, 'Closing channel');
	this.lastPing = new Date()
	this.subscribing = false;
	this.connected = false
	
	if (this.pongTimeout) {
		clearTimeout(this.pongTimeout)
	}
	
	this.pongTimeout = null
	
	if (this.ws) {
		this.ws.close();
		this.ws = null;
	}
	
	if (this.onClosed) {
		this.onClosed()
	}
};


/**
 * Envoit un message via le websocket
 * Le message est encapsulé dans un obet JSON pour
 * y ajouter les infos de connexion
 * 
 * @param message
 * @param onSendCallback
 */
Websocket.prototype.sendMessage = function(message, onSendCallback) {
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
		
		this.ws.send(jsonData, {compress: true}, function ack(error) {
			if (onSendCallback) {
				onSendCallback(error, message);
			}
		});
	} else if (onSendCallback) {
		onSendCallback('Websocket not connected !', message);
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
			websocket.connected = true;
			
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
			//LOG.info(websocket, 'Receiving data...');
			
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
				if (message.data) {
					// cas special du ping-pong
					if (message.data.header == "pong") {
						// supprime le timeout s'il est toujours
						if (websocket.pongTimeout) {
							clearTimeout(websocket.pongTimeout)
							websocket.pongTimeout = null
						}
					} else if (websocket.onMessage) {
						websocket.onMessage(message.data);
					}
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
