var deviceServer = require('./DeviceServer').newInstance();
var websocket = require('./Websocket').newInstance();
var offline = require('./Offline').newInstance();
var config = require('./Config').newInstance();
var LOG = require("./Log").newInstance();

// Le temps écoulé accepté pour renvoyer des messages à
// cause du websocket fermé
var SEND_MESSAGE_TIME = 30000; // 30 secondes

console.log("-------------------------------------------------");
console.log("Smarthome.start from dir", __dirname, new Date());
console.log("-------------------------------------------------");


// charge le fichier de config (synchrone)
config.load(__dirname + '/smarthome.credentials')


//lancement du websocket avec son listener pour la gestion des messages
websocket.onMessage = onWebsocketMessage;
websocket.onConnected = onWebsocketConnected;
websocket.credentials = config.credentials;
websocket.listen();


// On fournit un listener pour le changement des valeurs
//Démarre le serveur pour la lecture des devices
deviceServer.onMessage = onDeviceMessage;
deviceServer.credentials = config.credentials;
deviceServer.listen();


// gestionnaire fin application
process.on('SIGINT', exit);
process.on('SIGTERM', exit);


/**
 * Listener pour le changement des valeurs des devices
 * Délègue directement au websocket pour envoi au serveur
 * 
 * @param device
 */
function onDeviceMessage(message) {
	websocket.sendMessage(message, function (error, message) {
		offline.add(message)
		LOG.error(websocket, "Saving unsended message...", [error, message.header, message.mac]);
	});
}


/**
 * Listener pour les messages du websocket
 * Délégue directement au gestionnaire de devices
 * 
 * @param message
 */
function onWebsocketMessage(message) {
	deviceServer.sendMessage(message, function (error, message) {
		
	});
}


/**
 * Listener pour signaler la connexion complète du websocket
 * Permet de réenvoyer les valeurs hors connexion
 * 
 * @param message
 */
function onWebsocketConnected() {
	var message
	var now = new Date()
	
	while ((message = offline.remove()) != null) {
		var dateMessage = message.dateValue;
		
		if (dateMessage && (now.getTime() - dateMessage.getTime() <= SEND_MESSAGE_TIME)) {
			LOG.info(websocket, "Try re-sending saved message...", [message.header, message.mac])
			websocket.emit('sendMessage', message);
		} else {
			LOG.error(websocket, "Failed re-sending too old message !", [message.header, message.mac])
		}
	}
}


/**
 * Quitte proprement l'application en libérant les ressources
 */
function exit() {
	console.log("-------------------------------------------------");
	console.log("Smarthome.exit", new Date());
	deviceServer.close();
	websocket.close();
	console.log("-------------------------------------------------");
	process.exit();
}