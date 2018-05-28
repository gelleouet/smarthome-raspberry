/**
 * ZWave
 * 
 * Implémentation Device pour la gestion des objets ZWave
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var OpenZWave = require('openzwave-shared');
var Device = require("./Device").Device;
var LOG = require("./Log").newInstance();


var COMMAND_CLASS_CONFIGURATION = 112;
var COMMAND_CLASS_SWITCH_BINARY = 37;
var COMMAND_CLASS_SWITCH_MULTILEVEL = 38;


/**
 * Le mapping des commandes envoyées par la webapp
 * et celles programmées sur les devices
 */
var COMMAND_MAPPING = {
	"on": ["open"],
	"off": ["close"],
}

/**
 * Liste des valeurs qui doivent être enregistrées
 * dans la valeur principale du device
 * 
 * IMPORTANT : Cette liste doit être triée par ordre de priorité croissante pour les devices
 * qui ont 2 values dans la liste
 */
var MAIN_VALUES = ["level", "sensor", "smoke", "switch"]


/**
 * Des valeurs spéciales qui doivent être enregistrées sur
 * des devices à part
 */
var VIRTUAL_VALUES = ["temperature", "luminance"]



/**
 * Constructor
 * @see Device
 */
var ZWave = function ZWave(server) {
	Device.call(this, null, true, server);
	this.implClass = ""
	this.metavalues = {};
	this.metadatas = {};
	this.nodes = [];
	this.networkScan = false;
	this.type = null
	this.manufacturer = null
};

util.inherits(ZWave, Device);


/**
 * @see Device.init
 */
ZWave.prototype.init = function() {
	LOG.info(this, "Init");
	var device = this
	
	if (!device.credentials || !device.credentials.zwavePort) {
		LOG.error(device, "Init cancel : port not defined !")
		return
	}
	
	this.zwave = new OpenZWave({
        ConsoleOutput: false
	});
	
	this.zwave.on('driver ready', function(homeid) {
		LOG.info(device, 'Scanning network 0x%s...', homeid.toString(16));
	});
	
	this.zwave.on('driver failed', function() {
		LOG.error(device, 'Failed to start driver');
		device.zwave.disconnect();
	});
	
	this.zwave.on('scan complete', function() {
		LOG.info(device, 'Network scan complete.');
		device.networkScan = true;
	});
	
	this.zwave.on('node added', function(nodeid) {
		LOG.info(device, "node added ", nodeid);
		device.nodes[nodeid] = {}
	});
	
	this.zwave.on('node ready', function(nodeid, nodeinfo) {
		device.nodes[nodeid]['productinfo'] = nodeinfo
		LOG.info(device, "node ready " + nodeid, nodeinfo);
		device.sendDeviceValues(nodeid)
		
		// activation du polling sur les value de type command
		device.zwave.enablePoll(nodeid, COMMAND_CLASS_SWITCH_BINARY)
		device.zwave.enablePoll(nodeid, COMMAND_CLASS_SWITCH_MULTILEVEL)
	});
	
	this.zwave.on('node naming', function(nodeid, nodeinfo) {
		LOG.info(device, "node naming " + nodeid, nodeinfo);
	});

	this.zwave.on('node available', function(nodeid, nodeinfo) {
		LOG.info(device, "node available " + nodeid, nodeinfo);
	});
	
	this.zwave.on('node event', function(nodeid, event, value) {
		LOG.info(device, "node event " + nodeid, [event, value])
		// si pas de valeur, on envoit tout le packet
		if (value) {
			device.sendDeviceValues(nodeid, value.value_id)
		} else {
			device.sendDeviceValues(nodeid)
		}
	});
	
	this.zwave.on('value refreshed', function(nodeid, comclass, value) {
		LOG.info(device, "Value refreshed", value)
	});
	
	this.zwave.on('value changed', function(nodeid, comclass, value) {
		var oldValue = device.nodes[nodeid][value.value_id]
		device.nodes[nodeid][value.value_id] = value
		
		if (device.networkScan && oldValue.value != value.value) {
			LOG.info(device, "Value changed", value)
			device.sendDeviceValues(nodeid, value.value_id)
		} 
	});
	
	this.zwave.on('value added', function(nodeid, comclass, value) {
		device.nodes[nodeid][value.value_id] = value
		LOG.info(device, "Value added", value)
	});
	
	this.zwave.on('controller command', function(n, rv, st, msg) {
		LOG.info(device, 'controller commmand feedback: %s node==%d, retval=%d, state=%d',
				[msg, n, rv, st]);
	});

	
	this.zwave.connect(this.credentials.zwavePort);
};


/**
 * @see Device.free
 */
ZWave.prototype.free = function() {
	LOG.info(this, "Free")
	if (this.zwave) {
		this.zwave.disconnect();
	}
};


/**
 * @see Device.canWrite
 */
ZWave.prototype.canWrite = function(device) {
	return device.mac.indexOf("zwave") != -1;
};


/**
 * @see Device.write
 */
ZWave.prototype.write = function(device) {
	if (!device.command || !device.value) {
		LOG.error(this, "Failed to write : command and value required !")
		return
	}
	
	LOG.info(this, "Try command " + device.command + " with value " + device.value + " to device " + device.mac)
	var nodeId = device.mac.replace("zwave", "")
	var node = this.nodes[nodeId]
	
	if (!node) {
		LOG.error(this, "Device " + device.mac + " not found")
		return
	}
	
	// recherche d'abord avec les buttons du device
	/*var metaButton = this.findButton(node, COMMAND_MAPPING[device.command.toLowerCase()])
	
	if (metaButton) {
		LOG.info(this, "Try pressButton", metaButton.label)
		var ids = this.parseIds(metaButton.value_id)
		this.zwave.pressButton(ids.nodeId, ids.commandClass, ids.instance, ids.index)
		return
	}*/

	LOG.info(this, "No user button found for ", device.command)
	
	// sinon on passe par les méthodes "génériques"
	if (device.command.toLowerCase() == "on" || device.command.toLowerCase() == "off") {
		// recherche d'une value Switch
		var metaSwitch = this.findValue(node, ["switch"])
		
		if (metaSwitch) {
			LOG.info(this, "Try switch command")
			var ids = this.parseIds(metaSwitch.value_id)
			this.zwave.setValue(ids.nodeId, ids.commandClass, ids.instance, ids.index,
					device.command.toLowerCase() == "on" ? true : false)
		}
	} else {
		// recherche d'une value Level
		var metaLevel = this.findValue(node, ["level"])
		var value = this.convertValue(device.value)
		
		if (metaLevel) {
			LOG.info(this, "Try level command")
			var ids = this.parseIds(metaLevel.value_id)
			this.zwave.setValue(ids.nodeId, ids.commandClass, ids.instance, ids.index, value)
		}
	}
};


/**
 * @see Device.startInclusion
 */
ZWave.prototype.startInclusion = function() {
	LOG.info(this, "Starting inclusion...");
	this.zwave.addNode(false);
};


/**
 * @see Device.startExclusion
 */
ZWave.prototype.startExclusion = function() {
	LOG.info(this, "Starting exclusion...");
	this.zwave.removeNode();
};


/**
 * @see config
 */
ZWave.prototype.config = function(deviceMac, metadataName, metadataValue) {
	if (deviceMac.indexOf("zwave") != -1) {
		LOG.info(this, "Change config value for device " + deviceMac, [metadataName, metadataValue]);
		var value = this.convertValue(metadataValue)
		var ids = this.parseIds(metadataName)
		this.zwave.setConfigParam(ids.nodeId, ids.index, value)
	}
};


/**
 * @see resetConfig
 */
ZWave.prototype.resetConfig = function() {
	LOG.info(this, "Reset controller config...");
	this.zwave.hardReset();
};


/**
 * Convertit un node ZWave en device et envoit les infos au serveur
 * 
 */
ZWave.prototype.sendDeviceValues = function(nodeId, metaName) {
	var node = this.nodes[nodeId]
	var device = new ZWave(this.server)
	device.mac = "zwave" + nodeId
	
	if (node.productinfo) {
		device.label = node.productinfo.product
		device.type = node.productinfo.type
		device.manufacturer = node.productinfo.manufacturer
	}
	
	// toujours 0 : c'est sur la webapp avec le système de main meta que la
	// valeur sera ajustée
	device.value = 0
	
	// recherche de la meta principale
	var metaMain = this.findValue(node, MAIN_VALUES)
	
	for (valueName in node) {
		if (!metaName || metaName == valueName) {
			var metadata = node[valueName]
			
			if (this.isMetavalue(metadata)) {
				var metavalue = {
					label: metadata.label,
					value: metadata.value != null ? metadata.value : null,
					type: metadata.genre + ' (' + metadata.type + ')',
					main: (metaMain && metaMain.value_id == metadata.value_id),
					virtualDevice: this.isVirtualValue(metadata)
				}
				
				device.metavalues[valueName] = metavalue
			} else if (this.isMetadata(metadata)) {
				var metavalue = {
						label: metadata.label,
						value: metadata.value != null ? metadata.value : null,
						type: metadata.genre + ' (' + metadata.type + ')',
						values: metadata.values
				}
				
				device.metadatas[valueName] = metavalue
			}
		}
	}
	
	this.server.emit('value', device)
}


/**
 * 
 */
ZWave.prototype.isMetadata = function(metadata) { 
	return !metadata.read_only 
		&& metadata.genre != 'user' 
		&& metadata.value_id
}


/**
 * 
 */
ZWave.prototype.isMetavalue = function(metadata) {
	return metadata.genre == 'user' && metadata.type != 'button'
}


/**
 * 
 */
ZWave.prototype.isVirtualValue = function(metadata) {
	for (var idx=0; idx<VIRTUAL_VALUES.length; idx++) {
		if (metadata.label != null && metadata.label.toLowerCase() == VIRTUAL_VALUES[idx].toLowerCase()) {
			return true
		}
	}
	return false
}


/**
 * 
 */
ZWave.prototype.isMainValue = function(metadata) {
	for (var idx=0; idx<MAIN_VALUES.length; idx++) {
		if (metadata.label != null && metadata.label.toLowerCase() == MAIN_VALUES[idx].toLowerCase()) {
			return true
		}
	}
	return false
}

/**
 * Parse une chaine de type nodeId-commandClass-instance-index
 */
ZWave.prototype.parseIds = function(value) {
	if (!value) {
		return null;
	}
	
	var tokens = value.split("-");
	var ids = null
	
	if (tokens.length == 4) {
		ids = {
			nodeId: parseInt(tokens[0]),
			commandClass: parseInt(tokens[1]),
			instance: parseInt(tokens[2]),
			index: parseInt(tokens[3]),
		}
	}
	
	return ids
}


/**
 * Recherche d'une valeur d'un node par son label
 * On boucle d'abord sur la liste des labels comme ca
 * ca permet de retrouver une meta avec un ordre de priorité
 */
ZWave.prototype.findValue = function(node, labels) {
	if (labels == null) {
		return null
	}
	
	for (var idx=0; idx<labels.length; idx++) {
		for (valueName in node) {
			var metadata = node[valueName]
		
			if (metadata.label != null && metadata.label.toLowerCase() == labels[idx].toLowerCase()) {
				return metadata
			}
		}
	}
	
	return null
}


/**
 * Recherche d'un button avec son (ses) labels
 */
ZWave.prototype.findButton = function(node, labels) {
	if (labels == null) {
		return null
	}
	
	for (valueName in node) {
		var metadata = node[valueName]
		
		if (metadata.type == 'button') {
			for (var idx=0; idx<labels.length; idx++) {
				if (metadata.label != null && metadata.label.toLowerCase() == labels[idx].toLowerCase()) {
					return metadata
				}
			}
		}
	}
	
	return null
}


/**
 * Convertit une valeur avec le bon type
 */
ZWave.prototype.convertValue = function(value) {
	if (value == "true") {
		return true
	} else if (value == "false") {
		return false
	} else if (isNaN(value)) {
		return value
	} else {
		return parseInt(value)
	}
}


module.exports.ZWave = ZWave;
