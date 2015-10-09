/**
 * TeleInfo
 * 
 * Implémentation Device pour la lecture du téléinfo EDF
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var serialport = require("serialport");
var Device = require("./Device").Device;
var LOG = require("./Log").newInstance();


var SMARTHOME_CLASS = "smarthome.automation.deviceType.TeleInformation"
var TELEINFO_SERIAL_PORT = "/dev/ttyAMA0";
var READ_INTERVAL = 60000 * 5;	// toutes les 5 minutes

/**
 * Constructor
 * @see Device
 */
var TeleInfo = function TeleInfo(server) {
	Device.call(this, null, true, server);
	this.serialDevice = null;
	this.metavalues = {};
	this.implClass = SMARTHOME_CLASS
};

util.inherits(TeleInfo, Device);


/**
 * @see Device.init
 */
TeleInfo.prototype.init = function() {
	LOG.info(this, "Init");
	this.free();
	this.read();
	var device = this;
	
	// relance une lecture différée
	setTimeout(function() {
		device.init();
	}, READ_INTERVAL);
};


/**
 * @see Device.free
 */
TeleInfo.prototype.free = function() {
	if (this.serialDevice) {
		LOG.info(this, "Free");
		
		try {
			this.serialDevice.close();
		} catch (exception) {}
		this.serialDevice = null;
	}
};


/**
 * @see Device.read
 */
TeleInfo.prototype.read = function() {	
	var device = this;
	
	device.serialDevice = new serialport.SerialPort(TELEINFO_SERIAL_PORT, {
		baudrate: 1200,
		dataBits: 7,
		parity: 'even',
		stopBits: 1,
		// Caractères séparateurs = fin de trame + début de trame
		parser: serialport.parsers.readline(String.fromCharCode(13,3,2,10))
	});
	
	
	device.serialDevice.on('open', function() {
		device.serialDevice.on('data', function(data) {
			var lignes = data.split('\r\n');
			var values = {};
			
			for (var i=0; i < lignes.length; i++) {
				device.parseData(lignes[i], values);
			}
			
			// trame complète, on envoi un message au serveur
			if (values.adco && values.motdetat) {
				// création d'un nouvel objet à envoyer pour être thread-safe
				var teleinfo = new TeleInfo(device.server)
				teleinfo.mac = values.adco;
				teleinfo.value = values.iinst;
				teleinfo.metavalues = values;
				LOG.info(teleinfo, "Compteur " + teleinfo.mac + " detected !", teleinfo.value)
				
				// supprime les valeurs redondantes car pas mappé sur server
				delete values.adco;
				delete values.iinst;
				delete values.motdetat;
				
				device.server.emit("value", teleinfo);
				
				// on arrête la lecture du téléinfo car les lectures sont déclenchées à intervalle régulier
				device.free();
			}
		});
	});
};


/**
 * @see Device.isHorsConnexion
 */
TeleInfo.prototype.isHorsConnexion = function(value) {
	return true;
};


/**
 * Lecture d'une trame téléinfo (une ligne d'une trame)
 * 
 * @param data
 * @param values
 */
TeleInfo.prototype.parseData = function(data, values) {
	var device = this;
	
	// lecture des trames
	var tokens = data.split(" ");
	var checksum = device.checksum(data);
	
	if (tokens.length > 2 && checksum) {
		tokens[1] = tokens[1].replace(/\./g, "");
		
		if (tokens[0] == "ADCO") {
			values.adco = tokens[1];
		} else if (tokens[0] == "OPTARIF") {
			values.opttarif = tokens[1];
		} else if (tokens[0] == "ISOUSC") {
			values.isousc = tokens[1];
		} else if (tokens[0] == "HCHC") {
			values.hchc = tokens[1];
		} else if (tokens[0] == "HCHP") {
			values.hchp = tokens[1];
		} else if (tokens[0] == "PTEC") {
			values.ptec = tokens[1];
		} else if (tokens[0] == "IINST") {
			values.iinst = tokens[1];
		} else if (tokens[0] == "IMAX") {
			values.imax = tokens[1];
		} else if (tokens[0] == "PAPP") {
			values.papp = tokens[1];
		} else if (tokens[0] == 'MOTDETAT') {
			values.motdetat = true
		}
	}
};

/**
 * Calcule le checksum de la chaine de caractère
 * 
 * Spec chk : somme des codes ASCII + ET logique 03Fh + ajout 20 en hexadécimal
 * Résultat toujours un caractère ASCII imprimable allant de 20 à 5F en hexadécimal
 * Checksum calculé sur etiquette+space+données => retirer les 2 derniers caractères
 * 
 */
TeleInfo.prototype.checksum = function(value) {
	var sum = 0;
	var j;
	
	for (j=0; j < value.length-2; j++) {
		sum += value.charCodeAt(j);
	}
	
	sum = (sum & 63) + 32;
	
	return (sum == value.charCodeAt(j+1));
};



module.exports.TeleInfo = TeleInfo;
