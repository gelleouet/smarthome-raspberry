var DeviceServer = require('./DeviceServer');
var Offline = require('./Offline');
var websocket = require('./Websocket').newInstance();
var config = require('./Config').newInstance();
var LOG = require("./Log").newInstance();


console.log("-------------------------------------------------");
console.log("Smarthome.start from dir", __dirname, new Date());
console.log("-------------------------------------------------");


// charge le fichier de config (synchrone)
if (!config.load(__dirname + '/smarthome.credentials')) {
	if (!config.load('/boot/smarthome')) {
		exit()
	}
}

var offline = Offline.newInstance();
offline.onProcessMessage = onOfflineMessage;


//lancement du websocket avec son listener pour la gestion des messages
websocket.onMessage = onWebsocketMessage;
websocket.onConnected = onWebsocketConnected;
websocket.onClosed = onWebsocketClosed;
websocket.credentials = config.credentials;
websocket.listen();


// On fournit un listener pour le changement des valeurs
//Démarre le serveur pour la lecture des devices
var deviceServer = DeviceServer.newInstance(config.credentials)
deviceServer.onMessage = onDeviceMessage
deviceServer.listen()


// gestionnaire fin application
process.on('SIGINT', exit);
process.on('SIGTERM', exit);


/**
 * Listener pour le changement des valeurs des devices
 * Délègue directement au websocket pour envoi au serveur
 * 
 * @param message
 */
function onDeviceMessage(message) {
	websocket.sendMessage(message, function(error, message) {
		// gère la retransmission de message si seulement
		// erreur sur envoi websocket
		if (error) {
			offline.add(message)
		}
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
 * Listener pour les messages du gestionnaire offline
 * Renvoit le message via le websocket
 * 
 * @param message
 */
function onOfflineMessage(message) {
	websocket.sendMessage(message)
}


/**
 * Listener pour signaler la connexion complète du websocket
 * 
 * @param message
 */
function onWebsocketConnected() {
	offline.emit('online')
}


/**
 * Listener pour signaler la fermeture du websocket
 */
function onWebsocketClosed() {
	offline.emit('offline')
}


/**
 * Quitte proprement l'application en libérant les ressources
 */
function exit() {
	console.log("-------------------------------------------------");
	console.log("Smarthome.exit", new Date());
	deviceServer.close();
	websocket.close();
	offline.close();
	console.log("-------------------------------------------------");
	process.exit();
}