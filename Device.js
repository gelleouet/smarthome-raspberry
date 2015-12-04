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
	this.mac = mac;	
	this.input = input;
	this.server = server;
	this.lastRead = new Date();
	
	this.object = null;
	this.label = null;
	this.value = null;
	this.params = null;
	this.implClass = null;
	this.metavalues = null;
	this.metadatas = null;
	this.credentials = null;
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
 * Ecriture de données sur le device
 * Si device output
 */
Device.prototype.write = function(device) {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};


/**
 * Passe le device en mode inclusion
 * pour l'auto-détection de nouveaux devices
 */
Device.prototype.startInclusion = function() {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};


/**
 * Passe le device en mode exclusion
 * pour la suppression du controller d'un device
 */
Device.prototype.startExclusion = function() {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};


/**
 * Indique si le drive peut prendre en charge l'écriture du device
 */
Device.prototype.canWrite = function(device) {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};


/**
 * Change la configuration d'une propriété d'un device
 */
Device.prototype.config = function(deviceMac, metadataName, metadataValue) {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};



/**
 * Hérite de Event
 */
util.inherits(Device, events.EventEmitter);



module.exports.Device = Device;
