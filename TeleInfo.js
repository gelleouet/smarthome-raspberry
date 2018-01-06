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
var TELEINFO_CHECK_TIMER = 10000; // 10 secondes
var TELEINFO_VALUE_TIMER = 300000; // 5 minutes
// Timer pour l'envoide valeurs si dépassement puissance
// Le téléinfo envoit ce message pendant 1 minute 
// (cf http://www.planete-domotique.com/notices/ERDF-NOI-CPT_O2E.pdf)
// l'agent enverra donc 4 messages pendant cette minute, le temps à l'application de réagir
// au bout d'une minute, de toute facon, si la puissance dépasse toujours la limite, le compteur saute
var TELEINFO_ADPS_TIMER = 15000; // 15 secondes

/**
 * Constructor
 * @see Device
 */
var TeleInfo = function TeleInfo(server, id) {
	Device.call(this, null, true, server);
	
	this.metavalues = {};
	this.implClass = SMARTHOME_CLASS
	this.starting = true;
	this.timerCreate = false;
	this.id = id
};

util.inherits(TeleInfo, Device);


/**
 * @see Device.init
 */
TeleInfo.prototype.init = function() {
	var device = this;
	var portPath = (this.id && this.id > 1) ? ("teleinfoPort" + this.id) : "teleinfoPort"
	
	if (!device.credentials || !device.credentials[portPath]) {
		LOG.error(device, "Teleinfo init cancel : port not defined !")
		return
	}
	
	if (!this.object) {
		LOG.info(device, "Init (not connected)... port:", [portPath, this.credentials[portPath]]);
		
		device.object = new serialport.SerialPort(this.credentials[portPath], {
			baudrate: 1200,
			dataBits: 7,
			parity: 'even',
			stopBits: 1,
			// Caractères séparateurs = fin de trame + début de trame
			parser: serialport.parsers.readline(String.fromCharCode(13,3,2,10))
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
	}
	
	// création d'une routine pour surveiller l'état du driver
	// et le reconnecter automatiquement
	// IMPORTANT : a ne faire qu'une fois !!
	if (!this.timerCreate) {
		this.timerCreate = true;
		setInterval(function() {
			device.init();
		}, TELEINFO_CHECK_TIMER);
	}
};


/**
 * Réception des trames téléinfo
 * 
 */
TeleInfo.prototype.onData = function(data) {
	var lignes = data.split('\r\n');
	var values = {};
	var now = new Date();
	var timer = now.getTime() - this.lastRead.getTime();
	
	for (var i=0; i < lignes.length; i++) {
		this.parseData(lignes[i], values);
	}
	
	// trame complète, on envoi un message au serveur
	if (values.adco && values.motdetat && values.iinst && values.hchc && values.hchp) {
		var adps = values.adps && (timer >= TELEINFO_ADPS_TIMER);
		
		// on n'envoit le message que tous les X intervalles ou au 1er init
		// ou si adps signalé tous les Y intervalles
		if (this.starting || adps || (timer >= TELEINFO_VALUE_TIMER)) {
			// création d'un nouvel objet à envoyer pour être thread-safe
			var teleinfo = new TeleInfo(this.server)
			teleinfo.mac = values.adco.value;
			teleinfo.value = values.iinst.value;
			teleinfo.metavalues = values;
			
			// ajout d'une valeur par défaut du adps
			if (!teleinfo.metavalues.adps) {
				teleinfo.metavalues.adps = {
						value: "0",
						label: "Avertissement Dépassement Puissance (A)",
						trace: true
				}
			}
			
			LOG.info(teleinfo, "Compteur " + teleinfo.mac + " poll new value !", teleinfo.value, teleinfo.adps)
			
			// supprime les valeurs redondantes car pas mappé sur server
			delete values.adco;
			delete values.motdetat;
			
			this.server.emit("value", teleinfo);
			this.starting = false;
			this.lastRead = now;
		}
	} else if (timer >= (2 * TELEINFO_VALUE_TIMER)) {
		LOG.error(teleinfo, "Compteur " + teleinfo.mac + " : trame incomplete", values)
		this.lastRead = now;
	}
}


/**
 * @see Device.free
 */
TeleInfo.prototype.free = function() {
	if (this.object) {
		LOG.info(this, "Free");
		
		try {
			this.object.close();
		} catch (exception) {}
		this.object = null;
	}
};


/**
 * @see Device.canWrite
 */
TeleInfo.prototype.canWrite = function(device) {
	return false;
};


/**
 * @see Device.startInclusion
 */
TeleInfo.prototype.startInclusion = function() {
	
};


/**
 * @see Device.startExclusion
 */
TeleInfo.prototype.startExclusion = function() {
	
};


/**
 * @see config
 */
TeleInfo.prototype.config = function(deviceMac, metadataName, metadataValue) {
	
};


/**
 * @see resetConfig
 */
TeleInfo.prototype.resetConfig = function() {
	
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
		var metavalue = {
			value: tokens[1],
		}
		
		if (tokens[0] == "ADCO") {
			values.adco = metavalue
		} else if (tokens[0] == "OPTARIF") {
			values.opttarif = metavalue
			metavalue.label = "Option tarifaire"
		} else if (tokens[0] == "ISOUSC") {
			values.isousc = metavalue
			metavalue.label = "Intensité souscrite (A)"
		} else if (tokens[0] == "HCHC") {
			values.hchc = metavalue
			metavalue.label = "Total heures creuses (Wh)"
			metavalue.trace = true
		} else if (tokens[0] == "HCHP") {
			values.hchp = metavalue
			metavalue.label = "Total heures pleines (Wh)"
			metavalue.trace = true
		} else if (tokens[0] == "PTEC") {
			values.ptec = metavalue
			metavalue.label = "Période tarifaire"
		} else if (tokens[0] == "IINST") {
			values.iinst = metavalue
			metavalue.label = "Intensité instantanée (A)"
			metavalue.main = true
		} else if (tokens[0] == "IMAX") {
			values.imax = metavalue
			metavalue.label = "Intensité maximale (A)"
		} else if (tokens[0] == "PAPP") {
			values.papp = metavalue
			metavalue.label = "Puissance apparente (VA)"
		} else if (tokens[0] == 'MOTDETAT') {
			values.motdetat = true
		} else if (tokens[0] == 'ADPS') {
			values.adps = metavalue
			metavalue.label = "Avertissement Dépassement Puissance (A)"
			metavalue.trace = true
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
