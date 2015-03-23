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


var SUBSCRIBE_TIMEOUT = 60000 * 1; // toutes les 1 minutes
var HTTP_TIMEOUT = 1000 * 10; // 10 secondes

/**
 * Constructeur Websocket
 */
var Websocket = function() {
	this.token = null;
	this.username = null;
	this.applicationKey = null;
	this.applicationHost = null;
	this.websocketUrl = null;
	this.ws = null;
	this.onmessage = null;
	this.agentModel = null;
	this.credentialFile = null;
	
	var network = os.networkInterfaces();
	console.log('Websocket.<init> network interface', network);
	this.mac = network.eth0[0].mac;
	// pas d'info mac sur nodejs v0.10. donc il faut le rajouter dans les credentials
	this.address = network.eth0[0].address;
	
	var websocket = this;
	
	websocket.on('subscribe', function() {
		websocket.subscribe();
	});

	websocket.on('delaysubscribe', function() {
		websocket.delaySubscribe();
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
 * Connexion à l'application SmartHome pour s'authentifier
 * et récupérer un token de connexion pour le websocket
 */
Websocket.prototype.subscribe = function() {
	console.log("Websocket.subscribe try get a token from...");
	var websocket = this;
	
	if (this.credential()) {
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
		
		console.log("Websocket.subscribe url options", options);
		
		function subscribeCallBack(error, response, body) {
			if (response && response.statusCode == 200) {
				var token = null;
				
				try {
					token = JSON.parse(body);
				} catch (ex) {
					console.error('Websocket.subscribe response i not a valid json !', body);
				}
				
				if (token) {
					// le service nous renvoit un token pour le websocket ainsi que son URL
					websocket.token = token.token;
					websocket.websocketUrl = token.websocketUrl;
					
					if (websocket.token && websocket.websocketUrl) {
						console.info('Websocket.subscribe find new token', body);
						websocket.emit('websocket');
						return true;
					} else {
						console.error('Websocket.subscribe Find no token or websocketUrl !');
					}
				}
			}
			
			// arrivé là y'a eu une erreur plus haut
			console.error('Websocket.subscribe request error. Try reconnecting...', error, body);
			
			// on relance une tentative sinon le programme s'arrête
			websocket.emit('delaysubscribe');
		};
		
		request(options, subscribeCallBack);
	} else {
		console.info('Websocket.subscribe credentiel incomplet. Try reconnecting...', SUBSCRIBE_TIMEOUT);
		websocket.emit('delaysubscribe');
	}
};


/**
 * Lance la procédure de subscription mais après un délai d'attente
 */
Websocket.prototype.delaySubscribe = function() {
	var websocket = this;
	
	// les credentials sont incomplets, il faur retenter plus tard
	// on relance une tentative sinon le programme s'arrête
	setTimeout(function() {
		websocket.subscribe();
	}, SUBSCRIBE_TIMEOUT);
}


/**
 * Récupère dans un fichier les infos de connexion
 * à l'application SmartHome
 * 
 * @return true si les infos obligatoires sont présentes
 */
Websocket.prototype.credential = function() {
	if (!this.credentialFile) {
		console.error("Websocket.credential filename is mandatory !");
		return false;
	}
	
	console.log("Websocket.credential reading file...", this.credentialFile);
	var buffer = null;
	
	try {
		buffer = fs.readFileSync(this.credentialFile);
	} catch (ex) {
		console.error('Websocket.credential Error reading file', ex);
		return false;
	}
	
	if (buffer) {
		var credentials = JSON.parse(buffer);
			
		if (credentials) {
			this.username = credentials.username;
			this.applicationKey = credentials.applicationKey;
			this.applicationHost = credentials.applicationHost;
			this.agentModel = credentials.agentModel;
			this.mac = credentials.mac; // pas d'info mac sur nodejs v0.10. donc il faut le rajouter dans les credentials
			
			if (!this.mac) {
				throw new Exception("Mac must be specified in credential file !");
			}
			
			return this.username && this.applicationKey && this.applicationHost && this.mac;
		} else {
			console.error('Websocket.credential Error format JSON');
		}
	} else {
		console.error('Websocket.credential Error reading file');
	}
	
	return false;
};


/**
 * Libère les réssources et ferme le websocket
 */
Websocket.prototype.close = function() {
	if (this.ws) {
		this.ws.close();
		this.ws = null;
	}
	this.emit('delaysubscribe');
};


/**
 * Envoit un message via le websocket
 * Le message est encapsulé dans un obet JSON pour
 * y ajouter les infos de connexion
 * 
 * @param message
 */
Websocket.prototype.sendMessage = function(message) {
	if (this.ws) {
		var data = {
				mac: this.mac,
				token: this.token,
				applicationKey: this.applicationKey,
				username: this.username,
				data: message
		};
		
		this.ws.send(JSON.stringify(data), function ack(error) {
			if (error) {
				console.error('Websocket.sendMessage Erreur envoi', message, error);
			} else {
				console.info('Websocket.sendMessage Envoi ok', message)
			}
		});
	}
};


/**
 * Ouvre un websocket avec l'application SmartHome
 * Reste à l'écoute des messages depuis le websocket
 */
Websocket.prototype.websocket = function() {
	console.log("Websocket.websocket openning channel...", this.websocketUrl);
	
	if (this.token && this.websocketUrl) {
		var websocket = this;
		
		try {
			this.ws = new WsWebSocket(this.websocketUrl);
		} catch (ex) {
			console.error('Websocket.websocket error connexion websocket', ex);
			websocket.close();
			return;
		}
		
		this.ws.on('close', function(code, message) {
			console.log('Websocket.websocket Channel is disconnected', code, message);
			websocket.close();
		});
		
		this.ws.on('open', function() {
			console.log('Websocket.websocket Channel is connected');
			// vérifie que le channel fonctionne
			websocket.sendMessage('Hello');
		});
		
		this.ws.on('error', function(error) {
			console.error('Websocket.websocket Channel error', error);
			websocket.close();
		});
		
		this.ws.on('message', function message(data, flags) {
			console.log('Websocket.websocket receiving data', data, flags);
			if (websocket.onmessage) {
				websocket.onmessage(data);
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
