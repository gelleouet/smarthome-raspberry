/**
 * 
 */
var util = require('util');
var events = require('events');
var fs = require('fs');



/**
 * 
 */
var Offline = function() {
	
};

util.inherits(Offline, events.EventEmitter);


/**
 * Créé une instance Device en fonction de son type
 */
Offline.prototype.myfonction = function() {
	
};


module.exports.Offline = Offline;
module.exports.newInstance = function() {
	return new Offline();
};
