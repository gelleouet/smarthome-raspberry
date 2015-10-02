/**
 * Device
 * 
 * Classe abstraite à hériter par chaque implémentation de device
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var events = require('events');


/**
 * Constructor
 */
var Device = function(mac, input, server) {
	this.object = null;
	this.mac = mac;	
	this.input = input;
	this.value = null;
	this.server = server;
	this.params = null;
	this.implClass = null;
	this.metavalues = null;
	this.lastRead = new Date()
};


/**
 * Méthode utilitaire logger les infos d'un device
 */
Device.prototype.log = function() {
	console.log(this);
};


/**
 * Appelé à chaque création d'un device pour l'initialiser
 * avant la lecture et/ou écriture
 */
Device.prototype.init = function() {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};


/**
 * Appelé à la fin du programme ou pour la destruction d'un device
 * afin de libérer les ressources
 */
Device.prototype.free = function() {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};


/**
 * Lecture des données sur le device
 * si device input
 */
Device.prototype.read = function() {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};


/**
 * Ecriture de données sur le device
 * Si device output
 */
Device.prototype.write = function(value) {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};


/**
 * Indique si le device peut être utilisé en hors connexion
 * (Perte de la connexion avec le serveur principal)
 */
Device.prototype.isHorsConnexion = function(value) {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};


/**
 * Hérite de Event
 */
util.inherits(Device, events.EventEmitter);



module.exports.Device = Device;
