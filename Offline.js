/**
 * Offline
 * 
 * Gestionnaire pour stocket des valeurs hors connexion
 * Les valeurs sont stickées en mémoire dans une pile si le module lokijs n'est pas installé
 * Loki est une base nosql persistante légère entièrement en JS qui ne nécessite pas de processus
 * supplémentaire
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var events = require('events');
var LOG = require("./Log").newInstance();
var loki = null

var MAX_STACK = 500
var MAX_DATASTORE = 50000


/**
 * Constructor
 * @see Device
 */
var Offline = function Offline() {
	var self = this
	this.stack = []
	this.connected = false
	this.lokidb = null
	this.lokimessages = null
	this.onProcessMessage = null
	this.processingMessages = false
	
	// tente de charger le module loki
	try {
		loki = require('lokijs')
		LOG.info(this, 'Use Loki Persistent Datastore')
	} catch (ex) {
		LOG.info(this, 'Use Queue Memory Datastore')
	}
	
	if (loki) {
		this.lokidb = new loki('/home/pi/smarthomedb.json', {
			autosave: true,
			autosaveInterval: 5000
		})
		
		this.lokidb.loadDatabase({}, function(err) {
			if (!err) {
				// récupère ou construit la collection pour stocker les messages
				self.lokimessages = self.lokidb.getCollection("messages")
				
				if (!self.lokimessages) {
					LOG.info(self, "Create new messages collection")
					self.lokimessages = self.lokidb.addCollection("messages")
				} else {
					LOG.info(self, "Get existed messages collection", self.lokimessages.count())
				}
			} else {
				LOG.error(self, "Cannot load loki database", err)
			}
		})
	}
	
	// les listeners async
	this.on('online', function() {
		self.connected = true
		self.processMessages()
	})
	
	this.on('offline', function() {
		self.connected = false
		self.processingMessages = false
	})
	
	this.on('message', function(message) {
		if (self.onProcessMessage) {
			self.onProcessMessage(message)
		}
	})
};

util.inherits(Offline, events.EventEmitter);


/**
 * Ajoute un nouveau message en fin de pile
 * ou dans le datastore
 * Si le datastore n'est pas encore pret, utilse la pile en mémoire
 * 
 */
Offline.prototype.add = function(message) {
	message.offline = true
	
	if (this.lokimessages) {
		// sécurité pour ne pas avoir trop d'objets sur disque
		var nbMessages = this.lokimessages.count()
		
		if (nbMessages < MAX_DATASTORE) {
			this.lokimessages.insert(message)
		}
	} else {
		// sécurité pour ne pas avoir trop d'objets en mémoire
		if (this.stack.length < MAX_STACK) {
			this.stack.push(message)
		}
	}
}


/**
 * Supprime le message
 * Seulement si depuis datastore loki car sinon il est déjà supprimé de la queue
 * 
 * @param message
 */
Offline.prototype.remove = function(message) {
	if (persist && this.lokimessages) {
		this.lokimessages.remove(message)
	}
}


/**
 * Charge les messages offline et tente de les renvoyer
 * Ne le fait que si le programme est connecté
 * 
 * N'utilise pas d'événement pour envoyer les messages à la vitesse du websocket
 * Cela permet de les envoyer 1 à 1 et surtout permet de charger des "paquets" de messages
 * si le datastore est volumineux
 * 
 * A tout moment vérifies si le statut est online et sinon interromp le process
 */
Offline.prototype.processMessages = function() {
	if (this.connected && this.onProcessMessage && !this.processingMessages) {
		var message
		this.processingMessages = true
		
		// traite d'abord les messages en mémoire
		// les messages en mémoire ne sont traités qu'une seule fois car ils sont immédiatement
		// retirés du buffer
		// on les traite tous d'un coup car ils sont déjà en mémoire
		if (this.stack.length > 0) {
			LOG.info(this, "Process " + this.stack.length + " memory messages")
			
			while ((message = this.stack.shift()) !== undefined) {
				if (this.connected) {
					this.emit('message', message)
				} else {
					// on l'a pas traité, on le remet à sa place
					this.stack.splice(0, 0, message)
					this.processingMessages = false
					return
				}
			}
			
			LOG.info(this, "Processing memory messages is finished")
		}
		
		// traite ensuite les messages du datastore
		if (this.lokimessages) {
			var nbMessages = this.lokimessages.count()
			
			if (nbMessages > 0) {
				LOG.info(this, "Process " + nbMessages + " datastore messages")
				
				for (var idx=0; idx<nbMessages; idx++) {
					messages = this.lokimessages.chain().find({}).limit(1).data()
					
					if (messages.length == 1) {
						message = messages[0]
						
						if (this.connected) {
							this.lokimessages.remove(message)
							this.emit('message', message)
						} else {
							this.processingMessages = false
							return
						}
					}
				}
				
				LOG.info(this, "Processing datastore messages is finished")
			}
		}
		
		// fin traitement
		this.processingMessages = true
	}
}


/**
 * Fermeture et libération des ressources
 */
Offline.prototype.close = function() {
	LOG.info(this, 'Close')
	
	if (this.lokidb) {
		this.lokidb.close()
	}
}


module.exports.Offline = Offline;
module.exports.newInstance = function() {
	return new Offline();
};