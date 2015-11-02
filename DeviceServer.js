/**
 * 
 */
var util = require('util');
var events = require('events');
var Device = require("./Device").Device;
var TeleInfo = require("./TeleInfo").TeleInfo;
var OneWire = require("./OneWire").OneWire;
var ZWave = require("./ZWave").ZWave;
var Gpio = require("./Gpio").Gpio;
var Arduino = require("./Arduino").Arduino;
var LOG = require("./Log").newInstance();



/**
 * 
 */
var DeviceServer = function DeviceServer() {
	this.onMessage = null;
	
	this.drivers = []
	
	this.drivers['teleinfo'] = new TeleInfo(this);
	this.drivers['onewire'] = new OneWire(this);
	this.drivers['zwave'] = new ZWave(this);
	this.drivers['gpio'] = new Gpio(this);
	this.drivers['arduino'] = new Arduino(this);
};

util.inherits(DeviceServer, events.EventEmitter);


/**
 * Point d'entrée du serveur.
 * Installation des callback pour la lecture des devices 
 * en fonction des types
 * 
 */
DeviceServer.prototype.listen = function() {
	var deviceServer = this;	
	
	deviceServer.on('value', function(device) {
		deviceServer.onValue(device);
	});

	deviceServer.on('inclusion', function(driver) {
		deviceServer.onInclusion(driver);
	});

	deviceServer.on('write', function(driver, device) {
		deviceServer.onWrite(driver, device);
	});
	
	deviceServer.on('init', function(driver) {
		deviceServer.onInit(driver);
	});
	
	// Démarre tous les drivers
	for (driverName in this.drivers) {
		this.emit('init', this.drivers[driverName]);
	}

	LOG.info(this, 'Start listening...');
}


/**
 * Démarre l'inclusion automatique de nouveaux devices sur tous 
 * les protocoles enregistrés. L'arrêt de l'inclusion sera géré par 
 * timeout au niveau de chaque driver
 */
DeviceServer.prototype.startInclusion = function() {
	for (driverName in this.drivers) {
		this.emit('inclusion', this.drivers[driverName]);
	}
}


/**
 * Envoit d'un message aux devices
 * Le message est envoyé à tous les drivers et ceux qui peuvent 
 * le prendre en charge le traitent
 */
DeviceServer.prototype.sendMessage = function(message, onerror) {
	if (! message.header) {
		LOG.error(this, 'Message not valid : header required !');
	}
	
	if (message.header == "startInclusion") {
		this.startInclusion();
	} else if (message.header == "invokeAction") {
		for (driverName in this.drivers) {
			if (this.drivers[driverName].canWrite(device)) {
				this.emit('write', this.drivers[driverName], device);
			}
		}
	} else {
		LOG.error(this, "Header not recognized !", message.header);
	}
}


/**
 * Ferme le gestionnaire de devices
 */
DeviceServer.prototype.close = function() {
	for (driverName in this.drivers) {
		this.drivers[driverName].free();
	}
}


/**
 * Réception d'une nouvelle valeur d'un device
 */
DeviceServer.prototype.onValue = function(device) {
	if (this.onMessage) {
		var now = new Date();
		
		var message = {
				header: 'deviceValue',
				implClass: device.implClass, 
				mac: device.mac,
				value: device.value,
				dateValue: now,
				metavalues: device.metavalues,
				timezoneOffset: now.getTimezoneOffset()
		}
		
		this.onMessage(message);
	}
};


/**
 * Passe un driver en mode inclusion
 */
DeviceServer.prototype.onInclusion = function(driver) {
	driver.startInclusion();
}


/**
 * Init un driver
 */
DeviceServer.prototype.onInit = function(driver) {
	driver.init();
}


/**
 * Ecriture sur un device
 * Gestion des timers
 */
DeviceServer.prototype.onWrite = function(driver, device) {
	driver.write(device);
	
	if (device.params && device.params.timeout) {
		LOG.info('Start timer for ' + device.mac + ' : ' + device.params.timeout + 'ms');
		
		setTimeout(function() {
			// inversion de la valeur
			var value = parseInt(device.value)
			device.value = (value == 0 ? 1 : 0)
			driver.write(device);
		}, device.params.timeout);
	}
}


module.exports.DeviceServer = DeviceServer;
module.exports.newInstance = function() {
	return new DeviceServer();
};
