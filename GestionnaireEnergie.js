/**
 * GestionnaireEnergie
 * 
 * Implémentation d'un gestionnaire d'énergie pour un ballon d'eau chaude sanitaire et chauffage
 * 
 * l'ECS peut fonctionner de plusieurs manières :
 * - s'allume / s'éteint en fonction période tarifaire (ex : heure pleine) du compteur. Fonctionnement
 *   par défaut si aucune règle définie
 * - programmation de plage horaire. Ces plages peuvent être aussi conditionnées à une période
 *   tarifaire du compteur électrique
 * - heure de démarrage et une durée
 * 
 * L'objet peut être branché sur un objet Teleinfo et recevoir les trames décodées
 * C'est d'ailleur le teleinfo qui va "cadencer" le fonctionnement du ECS. Avec celui-ci, on peut 
 * se passer d'un timer ou d'un cron
 * 
 * Le délestage est géré sur l'ECS
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var Device = require("./Device").Device;
var CompositeParser = require("./parser/CompositeParser").CompositeParser;
var TeleInfoParser = require("./parser/TeleInfoParser").TeleInfoParser;
var OperatorParser = require("./parser/OperatorParser").OperatorParser;
var DateTimeParser = require("./parser/DateTimeParser").DateTimeParser;
var LOG = require("./Log").newInstance();

var TELEINFO_TIMER = 5000; // 5 secondes
var MAC_PREFIXE = "gestionnaireEnergie"


/**
 * Constructor
 * @see Device
 */
var GestionnaireEnergie = function GestionnaireEnergie(server, teleinfoDevice) {
	Device.call(this, null, true, server)
	this.teleinfoDevice = teleinfoDevice
	
	this.value = "0"
	this.lastTeleinfo = new Date(1970, 0, 1)
	this.isECS = false
	this.isChauffage = false
	this.plannings = []
		
	// métadonnées
	this.metavalues = {
		// teleinfo
		ptec: {
			value: "",
			label: "Période tarifaire"
		},
		adps: {
			value: "0",
			label: "Avertissement dépassement"
		},
		isousc: {
			value: "",
			label: "Intensité souscrite"
		},
		// ECS
		ecsMode: {
			value: "",	
			label: "ECS mode"	// on, off, auto (on et off = marche forcée par utilisateur)
		},
		ecsState: {
			value: "",
			label: "ECS state"	// on, off
		},
		// chauffage
		chauffageMode: {
			value: "",
			label: "Chauffage mode"
		}
	}
	
	// métadatas
	this.metadatas = {
		ecsActionneur: {
			value: "",
			label: "ECS actionneur"
		},
		ecsRule: {
			value: "isHC()", // valeur par défaut
			label: "ECS rule"
		}
	}
};

util.inherits(GestionnaireEnergie, Device);


/**
 * @see Device.init
 */
GestionnaireEnergie.prototype.init = function() {
	var _this = this
	
	if (_this.credentials.gestionnaireEnergie) {
		var root = _this.credentials.gestionnaireEnergie
		_this.mac = root.mac
		_this.implClass = _this.server.deviceClass("capteur")
		
		LOG.info(_this, "Init ", _this.mac);
		
		// configure un système ECS
		if (root.ecs) {
			_this.isECS = true
			_this.setECSMode(root.ecs.mode)
			_this.setECSActionneur(root.ecs.actionneur)
			
			if (root.ecs.rule) {
				_this.setECSRule(root.ecs.rule)
			}
		}
		
		// configure un système chauffage
		if (root.chauffage) {
			_this.isChauffage = true
			_this.setChauffageMode(root.chauffage.mode)
			
			for (zoneName in root.chauffage.zones) {
				var zone = root.chauffage.zones[zoneName]
				_this.setZoneActionneur(zoneName, zone.actionneur)
			}
		}
		
		// charge les plannings hebdomadaires
		if (root.plannings) {
			this.plannings = root.plannings
		}
		
		// active le listener teleinfo
		_this.teleinfoDevice.on("teleinfo", function(teleinfo) {
			_this.onTeleinfo(teleinfo)
		})
	}
};


/**
 * Listener teleinfo. Méthode centrale pour gérer le ECS.
 * A chaque message, on exécute les règles pour définir le nouvel état du ECS
 * 
 * @param teleinfo trame décodée téléinfo
 */
GestionnaireEnergie.prototype.onTeleinfo = function(teleinfo) {
	// ne traite les trames que toutes les Xsec pour ne pas trop surcharger les traitements
	// car le teleinfo est envoyé quasiment toutes les secs
	var now = new Date()
	
	if ((now.getTime() - this.lastTeleinfo.getTime()) < TELEINFO_TIMER) {
		return
	}
	
	this.value = teleinfo.papp.value
	this.metavalues.isousc.value = teleinfo.isousc.value
	this.lastTeleinfo = now
	var changeState = false
	
	// changement sur dépassement limite
	var changeADPS = this.switchADPS(teleinfo.adps.value)
	
	// changement période tarifaire
	changeState |= changeADPS
	changeState |= this.switchPTEC(teleinfo.ptec.value)
	
	// gestion ADPS
	// dès que ADPS, ne rien faire d'autre, donc c'est pour ca que la condition changeADPS est
	// déclarée dans le sous-bloc, sinon il exécuterait le else suivant
	if (teleinfo.adps.value != "0") {
		if (changeADPS) {
			LOG.error(this, "Avertissement ADPS !")
			
			// coupe l'ECS en priorité
			if (this.isECS && this.getECSState() == "on") {
				changeState |= this.switchECS("auto", "off")
			}
			
			if (this.isChauffage) {
				
			}
		}
	} else {
		// gestion ECS
		if (this.isECS) {
			var planning = this.findPlanning(this.plannings, "ecs", teleinfo, now)
			
			// si un planning existe, il est prioritaire sur les règles simples
			if (planning) {
				var planningValue = this.executePlanning(planning, now)
				changeState |= this.switchECS("auto", planningValue)
			} else {
				// exécute la règle ECS pour déterminer si on doit allumer ou pas l'ECS
				// la règle doit renvoyer true pour démarrer la chauffe. si false, l'ECS est arrêté
				var ruleEval = this.executeRule(this.getECSRule(), teleinfo, now)
				changeState |= this.switchECS("auto", ruleEval ? "on" : "off")
			}
		}
		
		// gestion chauffage
		if (this.isChauffage) {
			
		}
	}
	
	// déclenche un message sur le serveur pour signaler un changement d'état
	if (changeState) {
		this.syncState()
	}
}


/**
 * @see Device.free
 */
GestionnaireEnergie.prototype.free = function() {
	if (this.credentials.gestionnaireEnergie) {
		LOG.info(this, "Free");
	}
};


/**
 * @see Device.read
 */
GestionnaireEnergie.prototype.read = function() {	
	
};


/**
 * @see Device.canWrite
 */
GestionnaireEnergie.prototype.canWrite = function(device) {
	return device.mac.indexOf(MAC_PREFIXE) != -1
};


/**
 * @see Device.startInclusion
 */
GestionnaireEnergie.prototype.startInclusion = function() {
	
};


/**
 * @see Device.startExclusion
 */
GestionnaireEnergie.prototype.startExclusion = function() {
	
};


/**
 * Changement de config sur les métadatas
 * L'objet est modifié ainsi que la config générale si besoin. Les changements seront ainsi persistés
 * 
 * @see config
 */
GestionnaireEnergie.prototype.config = function(deviceMac, metadataName, metadataValue) {
	if (deviceMac.indexOf(MAC_PREFIXE) != -1) {
		if (metadataName == "_plannings") {
			this.plannings = metadataValue
		} else {
			LOG.info(this, "Change config", [metadataName, metadataValue])
			this.metadatas[metadataName].value = metadataValue
		}
		
		var root = this.credentials.gestionnaireEnergie
		
		// change les credentials
		switch(metadataName) {
			case "plannings": root.plannings = metadataValue; break 
			case "ecsActionneur": root.ecs.actionneur = metadataValue; break 
			case "ecsRule": root.ecs.rule = metadataValue; break 
		}
	}
};


/**
 * @see resetConfig
 */
GestionnaireEnergie.prototype.resetConfig = function() {
	
};


/**
 * Change la valeur d'ADPS
 * 
 * @param adps nouvelle valeur
 * 
 * @return true si la valeur a changé
 */
GestionnaireEnergie.prototype.switchADPS = function(adps) {
	var oldADPS = this.metavalues.adps.value
	this.metavalues.adps.value = adps
	return oldADPS != adps
}


/**
 * Change la valeur période tarifaire
 * 
 * @param ptec nouvelle valeur
 * 
 * @return true si la valeur a changé
 */
GestionnaireEnergie.prototype.switchPTEC = function(ptec) {
	var oldPTEC = this.metavalues.ptec.value
	this.metavalues.ptec.value = ptec
	return oldPTEC != ptec
}


/**
 * Actionne l'ECS si un changement d'état est demandé
 * Envoi un message au serveur pour indiquer le changement et rendre ainsi l'ECS connecté
 * 
 * @param mode on | off | auto
 * @param state on | off
 * 
 * @return true si un changement est effectué
 */
GestionnaireEnergie.prototype.switchECS = function(mode, state) {
	var currentMode = this.getECSMode()
	var currentState = this.getECSState()
	var changeState = currentMode != mode || currentState == state
	
	// le mode off ne peut pas être changé par un mode auto
	if (currentMode == "off" && mode == "auto") {
		return false
	}
	// le mode on-on peut être dérogé par tous les autres modes sauf 1 seul : le auto-off
	// on permet même le auto-on comme ca le cycle auto prend le relai ce qui permet d'arrêter automatiquement
	// le on-on. Ex : on passe en on-on dans la journée, le soir le mode passe en auto-on et 
	// ensuite auto-off à la fin du cycle
	if (currentMode == "on" && currentState == "on" && mode == "auto" && state == "off") { return false }
	
	LOG.info(this, "ECS " + mode + " " + state)
	
	// A ce stade, on peut déclencher un changement de mode
	this.setECSMode(mode)
	this.setECSState(state)
	
	// envoi d'un message à l'actionneur
	// un event sera systématiquement envoyé à l'actionneur, même si l'état n'a pas changé
	// on le fait pour s'assurer que son état est toujours à jour (ie s'il a redémarré et n'est plus
	// synchro avec le gestionnaire)
	var actionneur = {
		mac: this.getECSActionneur(),
		value: state == "on" ? "1" : "0",
		command: this.getECSState()
	}
	
	// préviens le serveur local pour commander l'actionneur
	this.server.emitWrite(actionneur)
	
	// synchronise l'état de l'actionneur sur le cloud
	// s'il a changé seulement
	if (changeState) {
		this.server.emit("value", actionneur)
	}
	
	return changeState
};


/**
 * Envoi l'état courant de l'objet (métadonnées + métadatas)
 */
GestionnaireEnergie.prototype.syncState = function() {
	LOG.info(this, "PAPP=" + this.value + " ADPS=" + this.metavalues.adps.value
			+ " PTEC=" + this.metavalues.ptec.value
			+" ECS=" + this.getECSMode() + " " + this.getECSState())
	this.server.emit("value", this)
}


/**
 * Le mode de chauffage
 * 
 * @return on | off
 */
GestionnaireEnergie.prototype.getChauffageMode = function() {
	return this.metavalues.chauffageMode.value
}


/**
 * Assigne le mode de chauffage
 * 
 * @param mode on | off
 */
GestionnaireEnergie.prototype.setChauffageMode = function(mode) {
	this.metavalues.chauffageMode.value = mode
}


/**
 * Le mode ECS
 * 
 * @return on | off | auto
 */
GestionnaireEnergie.prototype.getECSMode = function() {
	return this.metavalues.ecsMode.value
}


/**
 * Assigne le mode ECS
 * 
 * @param mode on | off | auto
 */
GestionnaireEnergie.prototype.setECSMode = function(mode) {
	this.metavalues.ecsMode.value = mode
}


/**
 * L'état ECS
 * 
 * @return on | off
 */
GestionnaireEnergie.prototype.getECSState = function() {
	return this.metavalues.ecsState.value
}


/**
 * Assigne le state ECS
 * 
 * @param state on | off
 */
GestionnaireEnergie.prototype.setECSState = function(state) {
	this.metavalues.ecsState.value = state
}


/**
 * Rule ECS
 * 
 * @return string
 */
GestionnaireEnergie.prototype.getECSRule = function() {
	return this.metadatas.ecsRule.value
}


/**
 * Assigne rule ECS
 * 
 * @param rule string
 */
GestionnaireEnergie.prototype.setECSRule = function(rule) {
	this.metadatas.ecsRule.value = rule
}


/**
 * Actionneur ECS
 * 
 * @return string
 */
GestionnaireEnergie.prototype.getECSActionneur = function() {
	return this.metadatas.ecsActionneur.value
}


/**
 * Assigne rule ECS
 * 
 * @param actionneur string
 */
GestionnaireEnergie.prototype.setECSActionneur = function(actionneur) {
	this.metadatas.ecsActionneur.value = actionneur
}


/**
 * Actionneur zone
 * 
 * @param zone
 * @return string
 */
GestionnaireEnergie.prototype.getZoneActionneur = function(zone) {
	return this.metadatas[zone + 'Actionneur'].value
}


/**
 * Assigne zone actionneur
 * 
 * @param zone string
 * @param actionneur string
 */
GestionnaireEnergie.prototype.setZoneActionneur = function(zone, actionneur, label) {
	this.metadatas[zone + 'Actionneur'].value = actionneur
	this.metadatas[zone + 'Actionneur'].label = label
}


/**
 * State zone
 * 
 * @param zone
 * @return string
 */
GestionnaireEnergie.prototype.getZoneState = function(zone) {
	return this.metavalues[zone + 'State'].value
}


/**
 * Assigne zone state
 * 
 * @param zone string
 * @param state string
 */
GestionnaireEnergie.prototype.setZoneState = function(zone, state) {
	this.metavalues[zone + 'State'].value = state
}


/**
 * Mode zone
 * 
 * @param zone
 * @return string
 */
GestionnaireEnergie.prototype.getZoneMode = function(zone) {
	return this.metavalues[zone + 'Mode'].value
}


/**
 * Assigne zone mode
 * 
 * @param zone string
 * @param mode string
 * @param label string
 */
GestionnaireEnergie.prototype.setZoneMode = function(zone, mode) {
	this.metavalues[zone + 'Mode'].value = mode
}


/**
 * Parser spécifique au gestionnaire
 * 
 * @param str chaine de caractères
 * 
 * @return la chaine transformée
 */
GestionnaireEnergie.prototype.parse = function(str) {
	return str.replace(/isChauffage\(\)/g, "this.getChauffageMode() == 'on'")
}


/**
 * Exécution d'une règle pour déterminer dans quel état positionner un appareil (ECS, chauffage, etc)
 * 
 * @param rule expression javascript
 * @param teleinfo valeur teleinfo
 * @param dateRule datetime quand appliquer la rule. si null => now 
 * 
 * @return true pour allumer, false sinon
 */
GestionnaireEnergie.prototype.executeRule = function(rule, teleinfo, dateRule) {
	var val = false
	var now = dateRule ? dateRule : new Date()
	var ge = this
	
	if (teleinfo && teleinfo.ptec && rule && rule != "") {
		// parsing rule avec différents parsers
		var teleInfoParser = new TeleInfoParser(teleinfo)
		var operatorParser = new OperatorParser()
		var datetimeParser = new DateTimeParser(now)
		// attention à l'ordre : le operator doit être placé avant car il peut décomposer une expression
		// en plusieurs, donc si une sous expression est multiplié, elles doivent être traitées
		// ensuite par les autres parsers
		var parser = new CompositeParser([operatorParser, teleInfoParser, datetimeParser])
		var parsingRule = this.parse(parser.parse(rule))
		console.log(parsingRule)
		
		// exécute de la rule dans le contexte du gestionnaire d'énergie (this)
		val = eval(parsingRule)
		//var ruleFunction = new Function("teleinfo", "dateRule", parsingRule)
		//ruleFunction = ruleFunction.bind(this)
		//val = ruleFunction(teleinfo, dateRule)
	}
	
	return val
}


/**
 * Exécute un planning pour déterminer dans quel état positionner un appareil (ECS, chauffage, etc)
 * 
 * @param planning tableau à 7 lignes pour les jours de la semaine et 48 colonnes pour les 1/2heures 
 * 	les lignes vont du lundi (0) au dimanche (6)
 * @param dateRule datetime quand appliquer la rule. si null => now
 * 
 * @return la valeur de la cellule, "off" par défaut
 */
GestionnaireEnergie.prototype.executePlanning = function(planning, dateRule) {
	var result = "off"
	
	return result
}


/**
 * Recherche d'un planning dans un tableau de plannings
 * Ne renvoit que le planning correspondant à la clé sélectionné
 * Applique les règles d'exécution si elles sont renseignées
 * 
 * @param plannings
 * @param key
 * @param teleinfo 
 * @param dateRule
 */
GestionnaireEnergie.prototype.findPlanning = function(plannings, key, teleinfo, dateRule) {
	for (var i=0; i<plannings.length; i++) {
		var planning = plannings[i]
		
		// sélection d'un planning en général en fonction rule
		if (!planning.rule || this.executeRule(planning.rule, teleinfo, dateRule)) {
			// le planning contient-il la clé
			if (planning.data && planning.data[key]) {
				// vérifie si le buffer contient bien 7 entrées pour les jours de la semaine
				if (planning.data[key].length == 7) {
					return planning.data[key]
				}
			}
		}
	}
	
	return null
}


module.exports.GestionnaireEnergie = GestionnaireEnergie;
