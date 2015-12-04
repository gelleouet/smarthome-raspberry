/**
 * TeleInfo
 * 
 * Implémentation Device pour la lecture du téléinfo EDF
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var OpenZWave = require('openzwave-shared');
var Device = require("./Device").Device;
var LOG = require("./Log").newInstance();


var SMARTHOME_ZWAVE_CLASS = "smarthome.automation.deviceType.Zwave"
var ZWAVE_PORT = "/dev/ttyUSB10";
var COMMAND_CLASS_CONFIGURATION = 112;
var COMMAND_CLASS_SWITCH_BINARY = 37;
var COMMAND_CLASS_SWITCH_MULTILEVEL = 38;


/**
 * Le mappng des commandes envoyées par la webapp
 * et celles programmées sur les devices
 */
var COMMAND_MAPPING = {
	"on": ["open"],
	"off": ["close"],
}

/**
 * Liste des valeurs qui doivent être enregistrées
 * dans la valeur principale du device
 */
var DEFAULT_VALUES = ["level", "sensor", "smoke"]

/**
 * Des valeurs spéciales qui doivent être enregistrées sur
 * des devices à part
 */
var ALONE_VALUES = ["temperature", "luminance"]


/**
 * Constructor
 * @see Device
 */
var ZWave = function ZWave(server) {
	Device.call(this, null, true, server);
	this.implClass = SMARTHOME_ZWAVE_CLASS
	this.metavalues = {};
	this.metadatas = {};
	this.nodes = [];
	this.networkScan = false;
};

util.inherits(ZWave, Device);


/**
 * @see Device.init
 */
ZWave.prototype.init = function() {
	LOG.info(this, "Init");
	var device = this
	
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
		LOG.info(device, "Found new device ", nodeid);
		device.nodes[nodeid] = {}
	});
	
	this.zwave.on('node ready', function(nodeid, nodeinfo) {
		device.nodes[nodeid]['productinfo'] = nodeinfo
		LOG.info(device, "Device " + nodeid + " is ready ", nodeinfo);
		device.sendDeviceMetavalues(nodeid)
		device.sendDeviceMetadatas(nodeid)
		device.sendDeviceAloneValues(nodeid)
		
		// activation du polling sur les value de type command
		device.zwave.enablePoll(nodeid, COMMAND_CLASS_SWITCH_BINARY)
		device.zwave.enablePoll(nodeid, COMMAND_CLASS_SWITCH_MULTILEVEL)
	});
	
	this.zwave.on('node naming', function(nodeid, nodeinfo) {
		LOG.info(device, "Device " + nodeid + " naming ", nodeinfo);
	});

	this.zwave.on('node available', function(nodeid, nodeinfo) {
		LOG.info(device, "Device " + nodeid + " available ", nodeinfo);
	});
	
	this.zwave.on('value refreshed', function(nodeid, comclass, value) {
		LOG.info(device, "Value refreshed", value)
	});
	
	this.zwave.on('value changed', function(nodeid, comclass, value) {
		var oldValue = device.nodes[nodeid][value.value_id]
		device.nodes[nodeid][value.value_id] = value
		
		if (device.networkScan && oldValue.value != value.value) {
			LOG.info(device, "Value changed", value)
			
			if (device.isMetadata(value)) {
				device.sendDeviceMetadatas(nodeid, value.value_id)
			} else if (device.isAloneValue(value)) {
				device.sendDeviceAloneValues(nodeid, value.value_id)
			} else {
				device.sendDeviceMetavalues(nodeid, value.value_id)
			}
		} 
	});
	
	this.zwave.on('value added', function(nodeid, comclass, value) {
		device.nodes[nodeid][value.value_id] = value
		LOG.info(device, "Value added", value)
	});
	
	this.zwave.connect(this.credentials && this.credentials.zwavePort ? this.credentials.zwavePort : ZWAVE_PORT);
};


/**
 * @see Device.free
 */
ZWave.prototype.free = function() {
	LOG.info(this, "Free")
	this.zwave.disconnect();
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
	var metaButton = this.findButton(node, COMMAND_MAPPING[device.command.toLowerCase()])
	
	if (metaButton) {
		LOG.info(this, "Try pressButton", metaButton.label)
		var ids = this.parseIds(metaButton.value_id)
		this.zwave.pressButton(ids.nodeId, ids.commandClass, ids.instance, ids.index)
		return
	}

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
 * Envoit une valeur autonome. Cela créé un nouveau sous device du device
 * principal
 */
ZWave.prototype.sendDeviceAloneValues = function(nodeId, metaName) {
	var node = this.nodes[nodeId]
	
	for (valueName in node) {
		if (!metaName || metaName == valueName) {
			var metadata = node[valueName]
			
			if (metadata.value && this.isAloneValue(metadata)) {
				var device = new ZWave(this.server)
				device.mac = "zwave" + metadata.value_id
				device.label = metadata.label
				if (node.productinfo) {
					device.label = device.label + ' (' + node.productinfo.product + ')'
				}
				device.value = metadata.value
				this.server.emit('value', device)
			}
		}
	}
}

/**
 * Convertit un node ZWave en device et envoit les infos au serveur
 * 
 */
ZWave.prototype.sendDeviceMetavalues = function(nodeId, metaName) {
	var node = this.nodes[nodeId]
	var device = new ZWave(this.server)
	device.mac = "zwave" + nodeId
	
	if (node.productinfo) {
		device.label = node.productinfo.product
	}
	
	// TODO : voir si la règle s'applique aux autres devices
	var metaLevel = this.findValue(node, DEFAULT_VALUES)
	
	if (metaLevel) {
		device.value = metaLevel.value
	} else {
		device.value = 0
	}
	
	for (valueName in node) {
		if (!metaName || metaName == valueName) {
			var metadata = node[valueName]
			
			if (this.isMetavalue(metadata)) {
				var metavalue = {
					label: metadata.label + (metadata.units ? ' (' + metadata.units + ')' : ''),
					value: metadata.value != null ? metadata.value : null,
					type: metadata.genre + ' (' + metadata.type + ')',
				}
				
				device.metavalues[valueName] = metavalue
			}
		}
	}
	
	this.server.emit('value', device)
}


/**
 * Convertit un node ZWave en device et envoit les infos au serveur
 * 
 */
ZWave.prototype.sendDeviceMetadatas = function(nodeId, metaName) {
	var node = this.nodes[nodeId]
	var device = new ZWave(this.server)
	if (node.productinfo) {
		device.label = node.productinfo.product
	}
	device.mac = "zwave" + nodeId
	
	// envoi en plusieurs morceaux car sinon ca peut prendre un gros volume si beaucoup de valeurs
	for (valueName in node) {
		if (!metaName || metaName == valueName) {
			var metadata = node[valueName]
				
			if (this.isMetadata(metadata)) {
				var metavalue = {
						label: metadata.label + (metadata.units ? ' (' + metadata.units + ')' : ''),
						value: metadata.value != null ? metadata.value : null,
						//help: metadata.help != null ? metadata.help : null,
						type: metadata.genre + ' (' + metadata.type + ')',
						values: metadata.values != null ? '' + metadata.values : null
				}
				
				device.metadatas[valueName] = metavalue
			}
		}
	}
	
	this.server.emit('value', device, 'deviceConfig')
}


/**
 * 
 */
ZWave.prototype.isMetadata = function(metadata) { 
	return !metadata.read_only 
		&& metadata.genre != 'user' 
		&& metadata.value_id
		&& !this.isAloneValue(metadata)
		&& !this.isDefaultValue(metadata)
}


/**
 * 
 */
ZWave.prototype.isMetavalue = function(metadata) {
	return metadata.genre == 'user' 
		&& metadata.type != 'button'
		&& !this.isAloneValue(metadata)
		&& !this.isDefaultValue(metadata)
}


/**
 * 
 */
ZWave.prototype.isAloneValue = function(metadata) {
	for (var idx=0; idx<ALONE_VALUES.length; idx++) {
		if (metadata.label != null && metadata.label.toLowerCase() == ALONE_VALUES[idx].toLowerCase()) {
			return true
		}
	}
	return false
}


/**
 * 
 */
ZWave.prototype.isDefaultValue = function(metadata) {
	for (var idx=0; idx<DEFAULT_VALUES.length; idx++) {
		if (metadata.label != null && metadata.label.toLowerCase() == DEFAULT_VALUES[idx].toLowerCase()) {
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
 */
ZWave.prototype.findValue = function(node, labels) {
	if (labels == null) {
		return null
	}
	
	for (valueName in node) {
		var metadata = node[valueName]
		
		for (var idx=0; idx<labels.length; idx++) {
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
