/**
 * Config
 * 
 * Charge la config du programme
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var events = require('events');
var fs = require('fs');
var LOG = require("./Log").newInstance();



/**
 * Constructor
 * @see Device
 */
var Config = function Config() {
	this.credentials = null;
};

util.inherits(Config, events.EventEmitter);


/**
 * Charge la config depuis le fichier
 * 
 */
Config.prototype.load = function(configFile) {
	LOG.info(this, "Loading...", configFile)
	
	try {
		var buffer = fs.readFileSync(configFile);
		this.credentials = JSON.parse(buffer);
	} catch (ex) {
		LOG.error(this, 'Reading config file', ex);
		return false;
	}
	
	return true
}


module.exports.Config = Config;
module.exports.newInstance = function() {
	return new Config();
};