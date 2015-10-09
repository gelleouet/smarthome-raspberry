/**
 * 
 */
var util = require('util');
var events = require('events');
var gpio = require('onoff').Gpio;
var serialport = require("serialport");
var pigpio = require("pi-gpio");
var Device = require("./Device").Device;
var TeleInfo = require("./TeleInfo").TeleInfo;
var OneWire = require("./OneWire").OneWire;


var ARDUINO_PORT = "/dev/ttyACM0";
var ARDUINO_FREQUENCY = 60000; // toutes les minutes

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

// /etc/modprobe.d/
// Vous écrivez à l’intérieur « options wire max_slave_count=20″


/**
 * 
 */
var DeviceServer = function() {
	this.devices = new Array();
	this.onValue = null;
	this.teleInfo = new TeleInfo(this);
	this.oneWire = new OneWire(this);
	this.arduino = null;
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

	deviceServer.on('arduino', function(device) {
		deviceServer.sendToArduino(device);
	});
	
	// connexion bidirectionnelle avec arduino avec un timer pour relancer les connexion perdues
	deviceServer.listenArduino();
	setInterval(function() {
		deviceServer.listenArduino();
	}, ARDUINO_FREQUENCY);
	
	deviceServer.teleInfo.init();
	deviceServer.oneWire.init();
	
	console.log('DeviceServer.startServer Start listening...');
	return deviceServer;
}


/**
 * Lance la connexion avec Arduino (via port série)
 * 
 */
DeviceServer.prototype.listenArduino = function() {
	var server = this;
	
	if (!server.arduino) {
		console.log("Check arduino connexion : try to reconnect...")
		
		try {
			server.arduino = new serialport.SerialPort(ARDUINO_PORT, {
				baudrate: 9600,
				// Caractères séparateurs = fin de trame + début de trame
				parser: serialport.parsers.readline('\n')
			});
			
			server.arduino.on('error', function(error) {
				console.log('Erreur onError Arduino', error);
				server.arduino = null;
			});
			
			server.arduino.on('open', function(error) {
				if (error) {
					console.log('Erreur onOpen Arduino', error);
					server.arduino = null;
				} else {
					server.arduino.on('data', function(data) {
						server.onArduinoData(data);
					});
					server.arduino.on('close', function(error) {
						console.log('Erreur onClose Arduino', error);
						server.arduino = null;
					});
				}
			});
		} catch(exception) {
			console.error("Erreur connexion Arduino", exception)
		}
	} else { 
		console.log("Check arduino connexion : already connected !")
	}
}


/**
 * Réception des trames Arduino
 * Il peut y avoir les logs de l'arduino ('LOG <message>') ou les envois d'infos
 * au format JSON ('DATA <json>')
 */
DeviceServer.prototype.onArduinoData = function(data) {
	// Pratique : on récupère les logs de l'arduino
	if (data.substr(0, 3) == 'LOG') {
		console.log('Arduino.log', data);
	} 
	// Envoi d'un paquet de données (valeur, nouveau device, etc.)
	else if (data.substr(0, 1) == '{') {
		try {
			var json = JSON.parse(data);		
			// Création d'un device à la volée
			var device = this.newDevice(json.mac, json.input, json.input ? 
				'smarthome.automation.deviceType.ContactSec' :
				'smarthome.automation.deviceType.BoutonOnOff');
			device.value = json.value;
			this.emit('value', device);
			this.emit('add', device);
		} catch (exception) {
			console.error("Cannot parsing arduino data", exception);
		}
		
	}
};


/**
 * Envoi d'un message à l'arduino
 */
DeviceServer.prototype.sendToArduino = function(device) {
	// vérifie la connexion
	if (this.arduino) {
		this.arduino.write(device.mac.replace('arduino', '') + ':' + device.value + '\n');
	}
};


/**
 * Créé une instance Device en fonction de son implémentation
 */
DeviceServer.prototype.newDevice = function(mac, input, implClass) {
	var device;
	
	if (implClass == 'smarthome.automation.deviceType.Temperature') {
		device = new OneWire(mac, input, this);
	} else if (implClass == 'smarthome.automation.deviceType.TeleInformation') {
		device = new TeleInfo(mac, input, this);
	} else {
		device =  new GPIO(mac, input, this);
	}
	
	device.implClass = implClass;
	return device;
};


/**
 * Efface le buffer de devices
 */
DeviceServer.prototype.clearDevices = function() {
	console.info('DeviceServer.clearDevices');
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
		console.error('DeviceServer.listenMessage message not compatible !');
	}
	
	console.log('DeviceServer.listenMessage parsing message', message.header);
	
	var device = message.device
	var existDevice = this.findDeviceByMac(device.mac);
	
	if (existDevice) {
		// action utilisateur sur un actionneur
		if (message.header == 'invokeAction' && !existDevice.input) {
			var newValue = parseInt(device.value);
			console.log('DeviceServer.listenMessage invokeAction', existDevice.mac, newValue);
			// mise à jour type device
			existDevice.params = device.params
			existDevice.write(newValue);
		}
	} else {
		console.error("Try to command an unfound device !", device.mac);
	}
};


/**
 * Ajoute un nouveau device dans le buffer
 */
DeviceServer.prototype.addDevice = function(device) {
	console.log('DeviceServer.addDevice new device', device.mac);
	
	if (!this.findDeviceByMac(device.mac)) {
		this.devices.push(device);
		device.init();
		console.log('DeviceServer.addDevice has now devices', this.devices.length);
	}
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
 * Implémentation Gpio
 * Hérite de Device
 */

var GPIO = function(mac, input, server) {
	Device.call(this, mac, input, server);
};

util.inherits(GPIO, Device);

GPIO.prototype.init = function() {
	console.log("GPIO.init...", this.mac, this.value);
	var device = this;
	var initValue = this.value;
	var correctMac = this.mac.replace('gpio', '');
	
	if (this.input) {
		// gestion du pulldown pour le input sinon le device est flottant.
		// La lib onoff ne le gère pas mais par contre, elle gère le cas ou le pin est déjà exporté		
		pigpio.open(MAPGPIO[this.mac], "input pulldown", function(error) {
			if (error) {
				console.error("pi-gpio error !", error);
			} else {
				console.log('init input pulldown ok...', device.mac)
			}
			
			// dans tous les cas, on continue car l'export peut ne pas marcher si device déjà exportée
			device.object = new gpio(correctMac, 'in', 'both');
			
			// 1ere lecture pour initialiser la bonne valeur
			device.value = device.object.readSync();
			console.log("GPIO.init gpio first read...", device.mac, device.value);
			// on informe le serveur avec la valeur initiale
			device.server.emit('value', device);
			
			device.object.watch(function(err, value) {
				if (!err) {
					var now = new Date();
					
					// gestion du debouncing (evite les rebonds lors de l'appui d'un BP
					// toute valeur recue en moins de 100ms est ignorée
					if ((now.getTime() - device.lastRead.getTime()) > 100) { 
						device.lastRead = new Date();
						
						if (device.value != value) {
							device.value = value;
							device.server.emit('value', device);
						}
					}
				} else {
					console.error('GPIO.init Erreur watch', device.mac, err);
				}
			});
			
			console.log("GPIO.init Start watching...", this.mac);
		});
	} else {
		//si une valeur est passée, on init le device avec la bonne valeur
		// sauf si device avec timeout sur le write
//		if (device.value && !device.params.timeout) {
//			this.write(device.value);
//		}
		
		console.log("GPIO.init Wait write value...", this.mac);
	}
};

GPIO.prototype.free = function() {
	var correctMac = this.mac.replace('gpio', '');
	
	if (this.object) {
		if (this.input) {
			this.object.unwatch();
			this.object.unexport();
		}
		console.log("GPIO.free unexport", this.mac);
	}
};

GPIO.prototype.read = function() {
	if (this.object) {
		var device = this;
		this.object.read(function(err, value) {
			if (!err) {
				device.lastRead = new Date()
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
	var device = this;
	device.server.emit('arduino', device);
	
	// gestion d'un timeout pour inverser la valeur sur les valeurs non nulles
	// on renvoit la valeur au serveur
	if (device.params && device.params.timeout && value) {
		console.log('GPIO.write trigger timeout for inversing value', device.mac, value);
		
		setTimeout(function() {
			device.write(0);
		}, device.params.timeout);
	}
};

// pas de hors connexion, puisque action temps réel
// donc si erreur pendant l'envoi, alors action perdue
GPIO.prototype.isHorsConnexion = function(value) {
	return false;
};




module.exports.DeviceServer = DeviceServer;
module.exports.newInstance = function() {
	return new DeviceServer();
};
