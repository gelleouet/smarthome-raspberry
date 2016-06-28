/**
 * Gpio
 * 
 * Implémentation Device pour la gestion du port GPIO
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var gpio = require('onoff').Gpio;
var pigpio = require("pi-gpio");
var Device = require("./Device").Device;
var LOG = require("./Log").newInstance();


var SMARTHOME_CLASS = "smarthome.automation.deviceType.ContactSec"
var MAPGPIO = {
	'gpio2': 3,
	'gpio3': 5,
	'gpio4': 7,
	'gpio17': 11,
	'gpio27': 13,
	'gpio22': 15,
	'gpio10': 19,
	'gpio9': 21,
	'gpio11': 23,
	'gpio14': 8,
	'gpio15': 10,
	'gpio18': 12,
	'gpio23': 16,
	'gpio24': 18,
	'gpio25': 22,
	'gpio8': 24,
	'gpio7': 26,
}
var DEBOUNCING = 100;
// envoi des valeurs counter toutes les 5min
var READ_IMPULS_TIMER = 300000;


/**
 * Constructor
 * @see Device
 */
var Gpio = function Gpio(server, mac) {
	Device.call(this, mac, true, server);
	this.implClass = SMARTHOME_CLASS
	this.devices = []
	this.impulsMaxSec = null
	this.impuls = null
	this.counter = 0
	this.counterMax = 0
	this.lastImpuls = null
};

util.inherits(Gpio, Device);


/**
 * @see Device.init
 */
Gpio.prototype.init = function() {
	if (this.credentials.gpioPorts) {
		for (deviceName in this.credentials.gpioPorts) {
			this.devices[deviceName] = new Gpio(this.server, deviceName)
			this.devices[deviceName].impulsMaxSec = this.credentials.gpioPorts[deviceName].impulsMaxSec
			this.devices[deviceName].impuls = this.credentials.gpioPorts[deviceName].impuls
			this.devices[deviceName].doInit();
		}
	}
}


/**
 * Initialise un port GPIO en entrée ou sortie
 */
Gpio.prototype.doInit = function() {
	var device = this;
	LOG.info(device, "Init...", device.mac);
	var correctMac = device.mac.replace('gpio', '');
	
	if (device.input) {
		var isImpuls = device.impulsMaxSec || device.impuls
		
		// gestion du pulldown pour le input sinon le device est flottant.
		// La lib onoff ne le gère pas mais par contre, elle gère le cas ou le pin est déjà exporté		
		pigpio.open(MAPGPIO[device.mac], "input pulldown", function(error) {
			if (error) {
				LOG.error(device, "pi-gpio error !", error);
			} else {
				LOG.info(device, 'input pulldown ok', [device.mac, device.impulsMaxSec, device.impuls])
			}
			
			// dans tous les cas, on continue car l'export peut ne pas marcher si device déjà exportée
			// branchement des interruptions : pour les compteurs on ne prend en compte que les changements de 0 à 1
			// pour les autres on prend tous les changements
			if (isImpuls) {
				device.object = new gpio(correctMac, 'in', 'rising');
			} else {
				device.object = new gpio(correctMac, 'in', 'both');
			}
			
			// 1ere lecture pour initialiser la bonne valeur
			if (!isImpuls) {
				device.value = device.object.readSync();
				LOG.info(device, "Reading first value...", [device.mac, device.value]);
				device.server.emit("value", device);
			}
			
			device.object.watch(function(err, value) {
				if (!err) {
					// branchement sur les différentes lectures
					if (device.impulsMaxSec) {
						device.impulsMaxSecRead(value)
					} else if (device.impuls) {
						device.impulsRead(value)
					} else {
						device.changeRead(value)
					}
				} else {
					LOG.error(device, 'Watch value', device.mac, err);
				}
			});
		});
	}
};


/**
 * Déclenche l'envoi de la valeur à chaque appel
 * Gestion du debounce
 */
Gpio.prototype.changeRead = function(value) {
	var now = new Date();
	
	// gestion du debouncing (evite les rebonds lors de l'appui d'un BP
	// toute valeur recue en moins de 100ms est ignorée
	if ((now.getTime() - this.lastRead.getTime()) > DEBOUNCING) { 
		this.lastRead = now;
		
		if (this.value != value) {
			this.value = value;
			LOG.info(this, this.mac + ' poll new value', this.value);
			this.server.emit('value', this);
		}
	}
}


/**
 * Compteur d'impulsion des valeurs à 1
 * Réinitialise le compteur toutes les impulsMaxSec secondes
 * Sur toute la période de lecture, ne prend que le max
 */
Gpio.prototype.impulsMaxSecRead = function(value) {
	var now = new Date()
	var device = this
	
	// init du compteur à chaque démarrage ou période
	if (!device.lastImpuls || ((now.getTime() - this.lastImpuls.getTime()) > this.impulsMaxSec)) {
		// à partir de la 2e lecture, on enregistre le max
		if (device.lastImpuls) {
			if (device.counter > device.counterMax) {
				device.counterMax = device.counter
			}
		}
		device.lastImpuls = now
		device.counter = 0
	}
	
	device.counter++
	
	// envoi de la valeur à chaque période et reset du compteur max
	if ((now.getTime() - this.lastRead.getTime()) > 30000/*READ_IMPULS_TIMER*/) {
		this.lastRead = now
		this.value = this.counterMax
		this.counterMax = 0
		LOG.info(this, this.mac + ' poll new value', this.value);
		//device.server.emit('value', this);
	}
}


/**
 * Compteur d'impulsion des valeurs à 1
 * Incrémente le compteur et envoit la valeur à chaque période de lecture
 */
Gpio.prototype.impulsRead = function(value) {
	if (value != 1) {
		return
	}
	
	var now = new Date()
	
	device.counter++
	
	// envoi de la valeur à chaque période et reset du compteur
	if ((now.getTime() - this.lastRead.getTime()) > READ_IMPULS_TIMER) {
		this.lastRead = now
		this.value = this.counter
		this.counter = 0
		LOG.info(this, this.mac + ' poll new value', this.value);
		device.server.emit('value', this);
	}
}


/**
 * @see Device.free
 */
Gpio.prototype.free = function() {
	for (deviceName in this.devices) {
		this.devices[deviceName].doFree();
	}
};


/**
 * Libère les ressources sur les ports ouverts
 */
Gpio.prototype.doFree = function() {
	if (this.object) {
		if (this.input) {
			this.object.unwatch();
			this.object.unexport();
		}
		LOG.info(this, "Unwatching...", this.mac);
	}
};


/**
 * @see Device.write
 */
Gpio.prototype.write = function(device) {
	
};


/**
 * @see Device.canWrite
 */
Gpio.prototype.canWrite = function(device) {
	return device.mac.indexOf("gpio") != -1;
};


/**
 * @see Device.startInclusion
 */
Gpio.prototype.startInclusion = function() {
	
};


/**
 * @see Device.startExclusion
 */
Gpio.prototype.startExclusion = function() {
	
};


/**
 * @see config
 */
Gpio.prototype.config = function(deviceMac, metadataName, metadataValue) {
	
};


/**
 * @see resetConfig
 */
Gpio.prototype.resetConfig = function() {
	
};



module.exports.Gpio = Gpio;
