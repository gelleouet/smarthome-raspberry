/**
 * OneWire
 * 
 * Implémentation Device pour la lecture des températures sondes Dallas sur le bus 1-Wire
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var fs = require('fs');
var Device = require("./Device").Device;
var LOG = require("./Log").newInstance();


var SMARTHOME_CLASS = "smarthome.automation.deviceType.Temperature"
var ONEWIRE_PATH = '/sys/bus/w1/devices/';
var ONEWIRE_FAMILY_TEMPERATURE = '28';
var READ_INTERVAL = 60000 * 5;	// toutes les 5 minutes


///etc/modprobe.d/
//Vous écrivez à l’intérieur « options wire max_slave_count=20″

/**
 * Constructor
 * @see Device
 */
var OneWire = function OneWire(server) {
	Device.call(this, null, true, server);
	this.implClass = SMARTHOME_CLASS
};

util.inherits(OneWire, Device);


/**
 * @see Device.init
 */
OneWire.prototype.init = function() {
	LOG.info(this, "Init")
	this.scanOneWireBus();
	var device = this;
	
	// relance une lecture différée
	setTimeout(function() {
		device.init();
	}, READ_INTERVAL);
};


/**
 * @see Device.free
 */
OneWire.prototype.free = function() {
	LOG.info(this, "Free")
};


/**
 * @see Device.read
 */
OneWire.prototype.read = function() {	
	var device = this;
	
 	fs.readFile(ONEWIRE_PATH + device.mac + '/w1_slave', function(error, buffer) {
 		if (error) {
 			LOG.error(device, "Read 1-Wire device " + device.mac, error);
 		} else if (buffer) {
	 		/* Exemple de fichier pour la famille des températures
	 		 * 37 00 4b 46 ff ff 07 10 1e : crc=1e YES
			 * 37 00 4b 46 ff ff 07 10 1e t=27312
	 		 */
	 		if (device.mac.substring(0, 2) == ONEWIRE_FAMILY_TEMPERATURE) {
	 			var lines = buffer.toString().split('\n');
	 			
	 			if (lines.length > 1 && lines[0].trim().match('YES$')) {
	 				var tokens = lines[1].split('t=');
	 				
	 				if (tokens && tokens[1]) {	 					
	 					device.value = tokens[1].trim();
						
						// conversion en float avec une seule décimale
						if (!isNaN(device.value)) {
							var convertValue = Math.round(+device.value / 100.) / 10.;
							
							// conversion à 0.5  près
							var intPart = parseInt(convertValue);
							var decimalPart = convertValue - intPart;
							
							if (decimalPart < 0.25) {
								convertValue = intPart;
							} else if (decimalPart < 0.75) {
								convertValue = intPart + 0.5;
							} else {
								convertValue = intPart + 1;
							}
							
							LOG.info(device, 'Sonde ' + device.mac + ' detected !', [device.value, convertValue]);
							device.value = convertValue;
							device.server.emit('value', device);
						}
	 				}
	 			} else {
	 				LOG.error(device, 'Checksum read ' + device.mac, buffer.toString());
				}
	 		} else {
	 			LOG.error(device, 'Family not implemented !', device.mac);
	 		}
 		} else {
 			LOG.error(device, 'File ' + device.mac + ' is empty !');
 		}
	});
};


/**
 * @see Device.canWrite
 */
OneWire.prototype.canWrite = function(device) {
	return false;
};


/**
 * @see Device.startInclusion
 */
OneWire.prototype.startInclusion = function() {
	
};


/**
 * @see config
 */
OneWire.prototype.config = function(deviceMac, metadataName, metadataValue) {
	
};



/**
 * Scanne le bus 1-Wire et lance la lecture des sondes trouvées
 */
OneWire.prototype.scanOneWireBus = function() {	
	var device = this;
	LOG.info(device, "Scan 1-Wire bus")
	
	// le path des devices 1-wire
	fs.readdir(ONEWIRE_PATH, function(error, files) {
		if (error) {
			LOG.error(device, 'Error scan 1-Wire bus', error);
		} else if (files) {
			files.forEach(function(file) {
				// on ne tient pas compte du dossier master
				if (file != 'w1_bus_master1') {
					// on construit un objet pour chaque device afin d'être thread-safe
					var sonde = new OneWire(device.server)
					sonde.mac = file
					sonde.read();
				}
			});
		}
	});
}


module.exports.OneWire = OneWire;
