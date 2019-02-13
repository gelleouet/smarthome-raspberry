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
	this.credentials = null
	this.configFile = null
};

util.inherits(Config, events.EventEmitter);


/**
 * Charge la config depuis le fichier
 * 
 * @param configFile chemin du fichier
 */
Config.prototype.load = function(configFile) {
	LOG.info(this, "Loading config...", configFile)
	
	try {
		var buffer = fs.readFileSync(configFile)
		this.credentials = JSON.parse(buffer)
		this.configFile = configFile
	} catch (ex) {
		LOG.error(this, 'Cannot load config ', configFile);
		return false;
	}
	
	return true
}


/**
 * Enregistrement des credentials dans le dernier fichier ouvert
 * 
 */
Config.prototype.save = function() {
	if (! this.configFile) {
		LOG.error(this, "Cannot save config : le fichier n'est pas spécifié !")
		return false
	}
	
	LOG.info(this, "Saving config...", this.configFile)
	
	try {
		fs.writeFileSync(this.configFile, JSON.stringify(this.credentials, null, 2))
	} catch (ex) {
		LOG.error(this, 'Cannot save config ', ex)
		return false
	}
	
	return true
}


module.exports.Config = Config;
module.exports.newInstance = function() {
	return new Config();
};