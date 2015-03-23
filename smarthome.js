var deviceServer = require('./device').newInstance();
var offline = require('./offline').newInstance();
var websocket = require('./websocket').newInstance();


var credentialFile = null;

// Scanne des arguments de la ligne de commande
process.argv.forEach(function(val, index, array) {
	if (val == '--credential') {
		credentialFile = array[index + 1];
		console.info('SmartHome.argv find --credential parameter : ', credentialFile);
	}
});


if (!credentialFile) {
	console.error('--credential parameter is mandatory !');
	process.exit(1);
}


// Démarre le serveur pour la lecture des devices
// On fournit un listener pour le changement des valeurs
deviceServer.onValue = onValueDevice;
deviceServer.listen();
deviceServer.addDevice(deviceServer.newDevice(17, true, 'gpio'))


// lancement du websocket avec son listener pour la gestion des messages
websocket.credentialFile = credentialFile;
websocket.onmessage = onMessageWebsocket;
websocket.subscribe();

// gestionnaire fin application
process.on('SIGINT', exit);


/**
 * Listener pour le changement des valeurs des devices
 * 
 * @param device
 */
function onValueDevice(device) {
	var message = {
			header: 'deviceValue',
			type: device.type, 
			mac: device.mac,
			value: device.value,
			input: true,
			dateValue: new Date()
	}
	
	console.log("device value change", device.mac, device.value);
	websocket.sendMessage(message);
}


/**
 * Listener pour les messages du websocket
 * 
 * @param message
 */
function onMessageWebsocket(message) {
	console.log("websocket message", message);
}


/**
 * Quitte proprement l'application en libérant les ressources
 */
function exit() {
  deviceServer.clearDevices();
  websocket.close();
  process.exit();
}