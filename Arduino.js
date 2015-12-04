/**
 * Arduino
 * 
 * Implémentation Device pour la gestion d'une carte Arduino
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var serialport = require("serialport");
var Device = require("./Device").Device;
var LOG = require("./Log").newInstance();


var INPUT_CLASS = "smarthome.automation.deviceType.ContactSec"
var OUTPUT_CLASS = "smarthome.automation.deviceType.BoutonOnOff"
var ARDUINO_PORT = "/dev/ttyUSB11";
var ARDUINO_TIMER = 10000; // 10 secondes


/**
 * Constructor
 * @see Device
 */
var Arduino = function Arduino(server, mac) {
	Device.call(this, mac, true, server);
	this.devices = []
	this.timerCreate = false;
};

util.inherits(Arduino, Device);


/**
 * @see Device.init
 */
Arduino.prototype.init = function() {
	var device = this;
	
	if (!device.object) {
		LOG.info(device, "Init (not connected)...");
		
		try {
			device.object = new serialport.SerialPort(
				device.credentials && device.credentials.arduinoPort ? device.credentials.arduinoPort : ARDUINO_PORT, {
				baudrate: 9600,
				// Caractères séparateurs = fin de trame + début de trame
				parser: serialport.parsers.readline('\n')
			});
			
			device.object.on('error', function(error) {
				LOG.error(device, 'Connexion impossible', error);
				device.object = null;
			});
			
			device.object.on('open', function(error) {
				if (error) {
					LOG.info(device, 'Serial port openning error', error);
					device.object = null;
				} else {
					device.object.on('data', function(data) {
						device.onData(data);
					});
					device.object.on('close', function(error) {
						LOG.info(device, 'Serial port closed !', error);
						device.object = null;
					});
				}
			});
		} catch (exception) {
			LOG.error(device, "Serial port error", exception)
		}
	}
	
	// création d'une routine pour surveiller l'état du driver
	// et le reconnecter automatiquement
	if (!this.timerCreate) {
		this.timerCreate = true;
		setInterval(function() {
			device.init();
		}, ARDUINO_TIMER);
	}
}


/**
 * Réception de données depuis l'arduino sur le porté série
 * 
 * Il peut y avoir les logs de l'arduino ('LOG <message>') ou les envois d'infos
 * au format JSON ('DATA <json>')
 * 
 */
Arduino.prototype.onData = function(data) {
	// Pratique : on récupère les logs de l'arduino
	if (data.substr(0, 3) == 'LOG') {
		LOG.info(this, "Arduino says :", data);
	} 
	// Envoi d'un paquet de données (valeur, nouveau device, etc.)
	else if (data.substr(0, 1) == '{') {
		try {
			var json = JSON.parse(data);		
			
			// Création d'un device à la volée
			var newDevice = new Arduino(this.server, json.mac); 
			newDevice.implClass = json.input ? INPUT_CLASS : OUTPUT_CLASS;
			newDevice.value = json.value;
			
			this.server.emit('value', newDevice);
		} catch (exception) {
			LOG.error(this, "Cannot parse data", exception, data);
		}
	}
};


/**
 * @see Device.free
 */
Arduino.prototype.free = function() {
	if (this.object) {
		LOG.info(this, "Free");
		
		try {
			this.object.close();
		} catch (exception) {}
		this.object = null;
	}
};


/**
 * @see Device.write
 */
Arduino.prototype.write = function(device) {
	// vérifie la connexion
	if (this.object) {
		LOG.info(this, "Write " + device.value + " to " + device.mac);
		this.object.write(device.mac.replace('arduino', '') + ':' + device.value + '\n');
	}
};


/**
 * @see Device.canWrite
 */
Arduino.prototype.canWrite = function(device) {
	return device.mac.indexOf("arduino") != -1;
};


/**
 * @see Device.startInclusion
 */
Arduino.prototype.startInclusion = function() {
	
};


/**
 * @see Device.startExclusion
 */
Arduino.prototype.startExclusion = function() {
	
};


/**
 * @see config
 */
Arduino.prototype.config = function(deviceMac, metadataName, metadataValue) {
	
};



module.exports.Arduino = Arduino;
