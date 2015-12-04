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


/**
 * Constructor
 * @see Device
 */
var Gpio = function Gpio(server, mac) {
	Device.call(this, mac, true, server);
	this.implClass = SMARTHOME_CLASS
	this.devices = []
};

util.inherits(Gpio, Device);


/**
 * @see Device.init
 */
Gpio.prototype.init = function() {
	if (this.credentials.gpioPorts && this.credentials.gpioPorts.length) {
		for (var idx=0; idx<this.credentials.gpioPorts.length; idx++) {
			var portName = this.credentials.gpioPorts[idx]
			this.devices[portName] = new Gpio(this.server, portName)
		}
	}
	
	for (deviceName in this.devices) {
		this.devices[deviceName].doInit();
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
		// gestion du pulldown pour le input sinon le device est flottant.
		// La lib onoff ne le gère pas mais par contre, elle gère le cas ou le pin est déjà exporté		
		pigpio.open(MAPGPIO[device.mac], "input pulldown", function(error) {
			if (error) {
				LOG.error(device, "pi-gpio error !", error);
			} else {
				LOG.info(device, 'input pulldown ok', device.mac)
			}
			
			// dans tous les cas, on continue car l'export peut ne pas marcher si device déjà exportée
			device.object = new gpio(correctMac, 'in', 'both');
			
			// 1ere lecture pour initialiser la bonne valeur
			device.value = device.object.readSync();
			LOG.info(device, "Reading first value...", [device.mac, device.value]);
			device.server.emit("value", device);
			
			device.object.watch(function(err, value) {
				if (!err) {
					var now = new Date();
					
					// gestion du debouncing (evite les rebonds lors de l'appui d'un BP
					// toute valeur recue en moins de 100ms est ignorée
					if ((now.getTime() - device.lastRead.getTime()) > DEBOUNCING) { 
						device.lastRead = now;
						
						if (device.value != value) {
							device.value = value;
							LOG.info(device, device.mac + ' poll new value', device.value);
							device.server.emit('value', device);
						}
					}
				} else {
					LOG.error(device, 'Watch value', device.mac, err);
				}
			});
		});
	}
};


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



module.exports.Gpio = Gpio;
