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
	this.server = server;
	this.lastRead = new Date();
	
	this.value = null;
	this.params = null;
	this.implClass = null;
	this.metavalues = null;
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
 * Indique si le drive peut prendre en charge l'écriture du device
 */
Device.prototype.canWrite = function(device) {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};


/**
 * Copie un device (la copie est de type Device)
 */
Device.prototype.clone = function(device) {
	var clone = new Device(device.mac, device.input, device.server)
	clone.value = device.value
	clone.params = device.params
	clone.implClass = device.implClass
	clone.metavalues = device.metavalues
	return clone
};


/**
 * Hérite de Event
 */
util.inherits(Device, events.EventEmitter);



module.exports.Device = Device;
