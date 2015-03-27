/**
 * 
 */
var util = require('util');
var events = require('events');
var gpio = require('onoff').Gpio;
var fs = require('fs');

var ONEWIREPATH = '/sys/bus/w1/devices/';
var ONEWIREDELAY = 60000 * 5;	// toutes les 5 minutes
var ONEWIREFAMILYTEMPERATURE = '28';

// /etc/modprobe.d/
// Vous écrivez à l’intérieur « options wire max_slave_count=20″


/**
 * 
 */
var DeviceServer = function() {
	this.devices = new Array();
	this.onValue = null;
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
		if (deviceServer.onValue) {
			deviceServer.onValue(device);
		}
	});
	
	deviceServer.on('add', function(device) {
		deviceServer.addDevice(device);
	});
		
	deviceServer.on('write', function(mac, value) {
		deviceServer.writeDevice(mac, value);
	});
	
	deviceServer.on('message', function(message) {
		deviceServer.listenMessage(message);
	});
	
	
	// listener one-wire
	deviceServer.listenOneWires();
	setInterval(function() {
		deviceServer.listenOneWires();		
	}, ONEWIREDELAY);
	
	console.log('DeviceServer.startServer Start listening...');
	return deviceServer;
}


/**
 * Créé une instance Device en fonction de son type
 */
DeviceServer.prototype.newDevice = function(mac, input, type) {
	if (type == 'gpio') {
		return new GPIO(mac, input, this);
	} else if (type == 'onewire') {
		return new OneWire(mac, input, this);
	} else {
		throw new Error('Type ' + type + ' not recognized !');
	}
};


/**
 * Efface le buffer de devices
 */
DeviceServer.prototype.clearDevices = function() {
	if (this.devices) {
		for (var i=0; i<this.devices.length; i++) {
			this.devices[i].free();
		}
	}

	this.devices.length = 0;
};


/**
 * Référence un device sur le serveur, si le device existe déjà, rafraichit ses infos.
 * Envoit un message si header == 'invokeAction'
 */
DeviceServer.prototype.listenMessage = function(message) {
	if (!message.device || ! message.header) {
		console.error('DeviceServer.subscribeDevice message not compatible !');
	}
	
	var device = message.device
	var existDevice = this.findDeviceByMac(device.mac);
	
	// on vérifie que le device n'a pas changé entre input et output
	if (existDevice) {
		if (existDevice.input != device.deviceType.capteur) {
			this.removeDevice(device.mac);
			existDevice = null;
		}
	}
	
	// si pas de device on en créée un à la volée
	if (!existDevice) {
		var type = null
		
		
		if (device.deviceType.implClass == 'smarthome.automation.deviceType.catalogue.Temperature') {
			//type = 'onewire'
			// les temperatures n'ont pas besoin d'etre référencées
		} else {
			type = 'gpio';
		}
		
		if (type) {
			existDevice = this.newDevice(device.mac, device.deviceType.capteur, type)
			existDevice.type = device.deviceType.libelle;
			this.addDevice(existDevice);
		}
	} 
	
	if (existDevice) {
		console.log('DeviceServer.subscribeDevice existDevice', existDevice.mac, existDevice.input, message.header);
		
		// action utilisateur sur un actionneur
		if (message.header == 'invokeAction' && !existDevice.input) {
			var newValue = parseInt(device.value);
			console.log('DeviceServer.subscribeDevice invokeAction', existDevice.mac, newValue);
			existDevice.write(newValue);
			
			
			// gestion d'un timeout pour inverser la valeur
			if (device.params && device.params.timeout) {
				setTimeout(function() {
					existDevice.write(newValue ? 0 : 1);
				}, device.params.timeout);
			}
		// capteur : on vérifie que les valeurs envoyées et lues correspondent
		} else if (existDevice.input) {
			if (parseFloat(existDevice.value) != parseFloat(device.value)) {
				this.emit('value', existDevice);
			}
		}
	}
};


/**
 * Supprime un device par son mac
 */
DeviceServer.prototype.removeDevice = function(mac) {
	console.log('DeviceServer.removeDevice try removing on buffer size', mac, this.devices.length);
	var device = this.findDeviceByMac(mac);
	
	if (device) {
		device.free();
		var index = this.devices.indexOf(device);
		
		if (index != 1) {
			this.devices.splice(index, 1);
		}
	}
	
	console.log('DeviceServer.removeDevice new buffer size', this.devices.length);
};


/**
 * Ajoute un nouveau device dans le buffer
 */
DeviceServer.prototype.addDevice = function(device) {
	console.log('DeviceServer.addDevice new device', device.mac);
	this.devices.push(device);
	device.init();
	console.log('DeviceServer.addDevice has now devices', this.devices.length);
};


/**
 * Envoit d'une nouvelle valeur à un device
 */
DeviceServer.prototype.writeDevice = function(mac, value) {
	console.log('DeviceServer.writeValue', mac, value);
	var device = this.findDeviceByMac(mac);
	if (device) {
		device.write(value);
	}
};


/**
 * Recherche d'un device par son mac dans la liste des devices
 * 
 * @param mac
 */
DeviceServer.prototype.findDeviceByMac = function(mac) {
	if (this.devices) {
		for (var i=0; i<this.devices.length; i++) {
			if (this.devices[i].mac == mac) {
				return this.devices[i];
			}
		}
	}
	
	return null;
};

/**
 * Recherche des devices par leur type dans la liste des devices
 * 
 * @param mac
 */
DeviceServer.prototype.findDeviceByType = function(type) {
	var matchDevices = [];
	var count = 0;
	
	if (this.devices) {
		for (var i=0; i<this.devices.length; i++) {
			if (this.devices[i].type == type) {
				matchDevices[count++] = this.devices[i];
			}
		}
	}
	
	return matchDevices;
};


/**
 * Liste les devices OneWire et pour chacun lance le listener
 * 
 * @param processListener
 */
DeviceServer.prototype.listenOneWires = function() {
	var server = this;
	
	console.log('DeviceServer.listenOneWires Search and read onewire devices');
	
	// le path des devices 1-wire
	fs.readdir(ONEWIREPATH, function(error, files) {
		if (error) {
			console.error('Error scan OneWire devices', error);
		} else if (files) {
			files.forEach(function(file) {
				// on ne tient pas compte du dossier master
				if (file != 'w1_bus_master1') {
					var device = server.newDevice(file, true, 'onewire');
					device.type = 'Température';
					device.init();
				}
			});
		}
	});
}; 


var Device = function(mac, input, server) {
	this.object = null;
	this.mac = mac;	
	this.input = input;
	this.value = null;
	this.server = server;
	this.type = null;
};

Device.prototype.log = function() {
	console.log(this);
};

Device.prototype.init = function() {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};

Device.prototype.free = function() {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};

Device.prototype.read = function() {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};

Device.prototype.write = function(value) {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};

Device.prototype.isHorsConnexion = function(value) {
	// chaque implémentation doit le définir
	console.warn('Not implemented !');
};

util.inherits(Device, events.EventEmitter);


/**
 * Implémentation Gpio
 * Hérite de Device
 */

var GPIO = function(mac, input, server) {
	Device.call(this, mac, input, server);
};

util.inherits(GPIO, Device);

GPIO.prototype.init = function() {
	var device = this;
	if (this.input) {
		this.object = new gpio(this.mac, 'in', 'both');	
		
		// 1ere lecture pour initialiser la bonne valeur
		device.value = this.object.readSync();
		
		this.object.watch(function(err, value) {
			if (!err) {
				if (device.value != value) {
					device.value = value;
					device.server.emit('value', device);
				}
			} else {
				console.error('GPIO.init Erreur watch gpio ' + device.mac, err);
			}
		});
		
		console.log("GPIO.init Start watching gpio..." + this.mac);
	} else {
		this.object = new gpio(this.mac, 'out');	
		console.log("GPIO.init Wait write value gpio..." + this.mac);
	}
};

GPIO.prototype.free = function() {
	if (this.object) {
		if (this.input) {
			this.object.unwatch();
		}
		this.object.unexport();
		console.log("GPIO.free unexport gpio " + this.mac);
	}
};

GPIO.prototype.read = function() {
	if (this.object) {
		var device = this;
		this.object.read(function(err, value) {
			if (!err) {
				device.value = value;
			} else {
				console.error('GPIO.read Error gpio', device.mac, err);
			}
		});
	}
};

GPIO.prototype.write = function(value) {
	console.error('GPIO.write try writing', this.mac, value);
	this.value = value;
	
	if (this.object) {
		var device = this;
		this.object.writeSync(this.value);
	}
};

// pas de hors connexion, puisque action temps réel
// donc si erreur pendant l'envoi, alors action perdue
GPIO.prototype.isHorsConnexion = function(value) {
	return false;
};


/**
 * Implémentation OneWire
 * Hérite de Device
 */

var OneWire = function(mac, input, server) {
	Device.call(this, mac, input, server);
};

util.inherits(OneWire, Device);

OneWire.prototype.init = function() {
	this.read();
	console.log("OneWire.init Start watching ..." + this.mac);
};

OneWire.prototype.free = function() {
	console.log("OneWire.free Unwatch onewire " + this.mac);
};

OneWire.prototype.read = function() {	
	var device = this;
	
 	fs.readFile(ONEWIREPATH + device.mac + '/w1_slave', function(error, buffer) {
 		if (error) {
 			console.error('OneWire.read Error reading', device.mac, error);
 		} else if (buffer) {
	 		/* Exemple de fichier pour la famille des températures
	 		 * 37 00 4b 46 ff ff 07 10 1e : crc=1e YES
			 * 37 00 4b 46 ff ff 07 10 1e t=27312
	 		 */
	 		if (device.mac.substring(0, 2) == ONEWIREFAMILYTEMPERATURE) {
	 			var lines = buffer.toString().split('\n');
	 			
	 			if (lines.length > 1 && lines[0].trim().match('YES$')) {
	 				var tokens = lines[1].split('t=');
	 				
	 				if (tokens && tokens[1]) {	 					
	 					device.value = tokens[1].trim();
						
						// conversion en float avec une seule décimale
						if (!isNaN(device.value)) {
							var convertValue = Math.round(+device.value / 100.) / 10.;
							console.log('OneWire.read Convert value', device.mac, device.value, convertValue);
							device.value = convertValue;
							device.server.emit('value', device);
						}
	 				}
	 			} else {
					console.error('OneWire.read checksum error', device.mac, buffer.toString());
				}
	 		} else {
	 			console.error('OneWire.read OneWire family not implemented', device.mac);
	 		}
 		} else {
 			console.error('OneWire.read File ' + device.mac + ' is empty');
 		}
	});
};

OneWire.prototype.isHorsConnexion = function(value) {
	return true;
};



module.exports.DeviceServer = DeviceServer;
module.exports.Device = Device;
module.exports.newInstance = function() {
	return new DeviceServer();
};
