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
var RFXCom = require("./RFXCom").RFXCom;
var Shell = require("./Shell").Shell;
var LOG = require("./Log").newInstance();


var DEFAUT_FREQUENCE = 300 // 5min en sec

var DEVICE_CLASS = {
	temperature: "smarthome.automation.deviceType.Temperature",
	humidite: "smarthome.automation.deviceType.Humidite",
	teleinfo: "smarthome.automation.deviceType.TeleInformation",
	compteur: "smarthome.automation.deviceType.Compteur",
	capteur: "smarthome.automation.deviceType.Capteur"
}


/**
 * 
 */
var DeviceServer = function DeviceServer(credentials) {
	this.onMessage = null;
	this.drivers = []
	this.credentials = credentials
	this.shell = new Shell(this)
	
	this.drivers['teleinfo'] = new TeleInfo(this, 1);
	this.drivers['teleinfo2'] = new TeleInfo(this, 2);
	this.drivers['onewire'] = new OneWire(this);
	this.drivers['zwave'] = new ZWave(this);
	this.drivers['gpio'] = new Gpio(this);
	this.drivers['arduino'] = new Arduino(this);
	this.drivers['rfxcom'] = new RFXCom(this);
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
	
	deviceServer.on('value', function(device, header) {
		deviceServer.onValue(device, header);
	});

	deviceServer.on('inclusion', function(driver) {
		driver.startInclusion();
	});
	
	deviceServer.on('exclusion', function(driver) {
		driver.startExclusion();
	});
	
	deviceServer.on('resetConfig', function(driver) {
		driver.resetConfig();
	});

	deviceServer.on('write', function(driver, device) {
		deviceServer.onWrite(driver, device);
	});
	
	deviceServer.on('init', function(driver) {
		driver.init();
	});

	deviceServer.on('config', function(driver, deviceMac, metadataName, metadataValue) {
		driver.config(deviceMac, metadataName, metadataValue);
	});
	
	// Démarre tous les drivers en injectant la config
	for (driverName in this.drivers) {
		var driver = this.drivers[driverName]
		driver.credentials = this.credentials
		this.emit('init', driver);
	}

	LOG.info(this, 'Start listening...');
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
		for (driverName in this.drivers) {
			this.emit('inclusion', this.drivers[driverName]);
		}
	} else if (message.header == "startExclusion") {
		for (driverName in this.drivers) {
			this.emit('exclusion', this.drivers[driverName]);
		}
	} else if (message.header == "config") {
		for (driverName in this.drivers) {
			this.emit('config', this.drivers[driverName], message.deviceMac, 
					message.metadataName, message.metadataValue);
		}
	} else if (message.header == "invokeAction" && message.device) {
		for (driverName in this.drivers) {
			if (this.drivers[driverName].canWrite(message.device)) {
				this.emit('write', this.drivers[driverName], message.device);
			}
		}
	} else if (message.header == "resetConfig") {
		for (driverName in this.drivers) {
			this.emit('resetConfig', this.drivers[driverName]);
		}
	} else if (message.header == "shell") {
		this.shell.write(message.data)
	} else if (message.header.indexOf("teleinfo") != -1) {
		for (driverName in this.drivers) {
			if (driverName.indexOf("teleinfo") != -1) {
				this.drivers[driverName].processMessage(message)
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
	this.shell.free()
	
	for (driverName in this.drivers) {
		this.drivers[driverName].free()
	}
}


/**
 * Réception d'une nouvelle valeur d'un device
 */
DeviceServer.prototype.onValue = function(device, header) {
	if (this.onMessage) {
		var now = new Date();
		
		var message = {
				header: header ? header : 'deviceValue',
				implClass: device.implClass, 
				mac: device.mac,
				value: device.value,
				label: device.label,
				dateValue: now,
				metavalues: device.metavalues,
				metadatas: device.metadatas,
				timezoneOffset: now.getTimezoneOffset()
		}
		
		this.onMessage(message);
	}
};


/**
 * Ecriture sur un device
 * Gestion des timers
 */
DeviceServer.prototype.onWrite = function(driver, device) {
	driver.write(device);
	
	if (device.params && device.params.timeout) {
		LOG.info(this, 'Start timer for ' + device.mac + ' : ' + device.params.timeout + 'ms');
		
		setTimeout(function() {
			// inversion de la valeur
			var value = parseInt(device.value)
			device.value = (value == 0 ? 1 : 0)
			driver.write(device);
		}, device.params.timeout);
	}
}


/**
 * Retourne la fréquence d'un device (en seconde)
 * 
 * @param deviceName @see DEVICE_CLASS
 */
DeviceServer.prototype.frequence = function(deviceName) {
	var deviceClass = this.deviceClass(deviceName)
	
	if (!deviceClass) {
		return DEFAUT_FREQUENCE
	}
	
	if (this.credentials.frequences) {
		if (this.credentials.frequences[deviceClass]) {
			return this.credentials.frequences[deviceClass]
		}
	}
	
	return DEFAUT_FREQUENCE
}


/**
 * Retourne l'implémentation smarthome d'un device
 * 
 * @param deviceName @see DEVICE_CLASS
 */
DeviceServer.prototype.deviceClass = function(deviceName) {
	return DEVICE_CLASS[deviceName]
}


module.exports.DeviceServer = DeviceServer;
module.exports.newInstance = function(credentials) {
	return new DeviceServer(credentials);
};
