/**
 * I2C
 * 
 * Implémentation I2C pour la lecture des composants I2C
 * Impl de haut niveau qui gère l'accès au bus I2C des capteurs I2C
 * 
 * Il faut implémenter des classes de bas niveau pour chaque composant
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var Device = require("./Device").Device;
var LOG = require("./Log").newInstance();
var BME280 = require("./i2c/BME280").BME280;
var i2cDriver = require('i2c-bus');

var READ_INTERVAL = 60000 * 5;	// toutes les 5 minutes


/**
 * Constructor
 * @see Device
 */
var I2C = function I2C(server) {
	Device.call(this, null, true, server);
	this.devices = []
	this.i2cBus = null
};

util.inherits(I2C, Device);


/**
 * @see Device.init
 */
I2C.prototype.init = function() {
	var i2c = this
	
	if (this.credentials.i2c) {
		LOG.info(this, "Init")
		this.i2cBus = i2cDriver.openSync(this.credentials.i2c.bus)
		
		for (deviceName in this.credentials.i2c) {
			if (deviceName == "bme280") {
				this.devices[deviceName] = new BME280(this.server)
			}
			
			// bind les infos générales et démarre le init
			if (this.devices[deviceName]) {
				this.devices[deviceName].credentials = this.credentials.i2c[deviceName]
				this.devices[deviceName].i2cBus = this.i2cBus
				this.devices[deviceName].init()
			}
		}
	}
	
	// Démarre une lecture toutes les X minutes
	// pour tous les devices
	setInterval(function() {
		i2c.read();
	}, READ_INTERVAL);
};


/**
 * @see Device.free
 */
I2C.prototype.free = function() {
	if (this.credentials.i2c) {
		LOG.info(this, "Free")

		for (deviceName in this.devices) {
			this.devices[deviceName].free()
		}
		
		if (this.i2cBus) {
			this.i2cBus.closeSync()
		}
	}
};


/**
 * @see Device.read
 */
I2C.prototype.read = function() {	
	for (deviceName in this.devices) {
		this.devices[deviceName].read()
	}
};


/**
 * @see Device.canWrite
 */
I2C.prototype.canWrite = function(device) {
	return false;
};


/**
 * @see Device.startInclusion
 */
I2C.prototype.startInclusion = function() {
	
};


/**
 * @see Device.startExclusion
 */
I2C.prototype.startExclusion = function() {
	
};


/**
 * @see config
 */
I2C.prototype.config = function(deviceMac, metadataName, metadataValue) {
	
};


/**
 * @see resetConfig
 */
I2C.prototype.resetConfig = function() {
	
};



module.exports.I2C = I2C;
