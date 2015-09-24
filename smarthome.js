var deviceServer = require('./device').newInstance();
var offline = require('./offline').newInstance();
var websocket = require('./websocket').newInstance();
var fs = require('fs');


console.log("-------------------------------------------------");
console.log("Smarthome.start from dir", __dirname, new Date());
console.log("-------------------------------------------------");


// On fournit un listener pour le changement des valeurs
deviceServer.onValue = onValueDevice;

// préconfiguration des pins :
// de cette manière, les pins en input vont automatiquement s'enregistrer sur le serveur avec les bons names
// l'utilisateur n'aura pas besoin de le faire manuellement
deviceServer.addDevice(deviceServer.newDevice('gpio4', true, 'smarthome.automation.deviceType.catalogue.ContactSec'));
deviceServer.addDevice(deviceServer.newDevice('gpio17', true, 'smarthome.automation.deviceType.catalogue.ContactSec'));
deviceServer.addDevice(deviceServer.newDevice('gpio22', true, 'smarthome.automation.deviceType.catalogue.ContactSec'));
deviceServer.addDevice(deviceServer.newDevice('gpio18', true, 'smarthome.automation.deviceType.catalogue.ContactSec'));
deviceServer.addDevice(deviceServer.newDevice('gpio23', true, 'smarthome.automation.deviceType.catalogue.ContactSec'));
deviceServer.addDevice(deviceServer.newDevice('gpio24', true, 'smarthome.automation.deviceType.catalogue.ContactSec'));
deviceServer.addDevice(deviceServer.newDevice('gpio25', true, 'smarthome.automation.deviceType.catalogue.ContactSec'));


//Démarre le serveur pour la lecture des devices
deviceServer.listen();

// lancement du websocket avec son listener pour la gestion des messages
websocket.onmessage = onMessageWebsocket;
websocket.listen();

// gestionnaire fin application
process.on('SIGINT', exit);
process.on('SIGTERM', exit);


/**
 * Listener pour le changement des valeurs des devices
 * 
 * @param device
 */
function onValueDevice(device) {
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
	
	console.log("Smarthome.onValueDevice", device.mac, device.value);
	
	websocket.sendMessage(message, function (error, message) {
		
	});
}


/**
 * Listener pour les messages du websocket
 * 
 * @param message
 */
function onMessageWebsocket(message) {
	console.log("Smarthome.onMessageWebsocket", message);
	
	if (message.device) {
		deviceServer.emit('message', message);
	}
}


/**
 * Quitte proprement l'application en libérant les ressources
 */
function exit() {
	console.log("Smarthome.exit", new Date());
	deviceServer.clearDevices();
	websocket.close();
	process.exit();
}