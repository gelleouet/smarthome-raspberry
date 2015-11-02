/**
 * Offline
 * 
 * Gestionnaire pour stocket des valeurs hors connexion
 * Les valeurs sont stickées en mémoire dans une pile
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var events = require('events');
var LOG = require("./Log").newInstance();



/**
 * Constructor
 * @see Device
 */
var Offline = function Offline() {
	this.stack = [];
};

util.inherits(Offline, events.EventEmitter);


/**
 * Ajoute un nouveau message dans la pile
 * 
 */
Offline.prototype.add = function(message) {
	this.stack.push(message)
}


/**
 * renvoit et supprime le 1er élément de la pile
 */
Offline.prototype.remove = function() {
	if (this.stack.length > 0) {
		return this.stack.shift()
	} else {
		return null;
	}
}


module.exports.Offline = Offline;
module.exports.newInstance = function() {
	return new Offline();
};