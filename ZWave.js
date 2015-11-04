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


var SMARTHOME_CLASS = "smarthome.automation.deviceType.Zwave"
var ZWAVE_PORT = "/dev/ttyUSB0";
var COMMAND_CLASS_CONFIGURATION = 112;
var COMMAND_CLASS_SWITCH_BINARY = 37;
var COMMAND_CLASS_SWITCH_MULTILEVEL = 38;


/**
 * Constructor
 * @see Device
 */
var ZWave = function ZWave(server) {
	Device.call(this, null, true, server);
	this.implClass = SMARTHOME_CLASS
	this.metavalues = {};
	this.metadatas = {};
	this.nodes = [];
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
	});
	
	this.zwave.on('node added', function(nodeid) {
		LOG.info(device, "Found new device ", nodeid);
		device.nodes[nodeid] = {
				ready: false
		}
	});
	
	this.zwave.on('node ready', function(nodeid, nodeinfo) {
		device.nodes[nodeid]['productinfo'] = nodeinfo
		device.nodes[nodeid].ready = true
		LOG.info(device, "Device " + nodeid + " is ready ", nodeinfo);
		device.sendDeviceMetavalues(nodeid)
		device.sendDeviceMetadatas(nodeid)
		
		// activation du polling sur les value de type command
		device.zwave.enablePoll(nodeid, COMMAND_CLASS_SWITCH_BINARY)
		device.zwave.enablePoll(nodeid, COMMAND_CLASS_SWITCH_MULTILEVEL)
	});
	
	this.zwave.on('value changed', function(nodeid, comclass, value) {
		var oldValue = device.nodes[nodeid][value.value_id]
		device.nodes[nodeid][value.value_id] = value
		
		if (device.nodes[nodeid].ready && oldValue.value != value.value) {
			if (device.isMetadata(value)) {
				device.sendDeviceMetadatas(nodeid, value.value_id)
			} else {
				device.sendDeviceMetavalues(nodeid, value.value_id)
			}
		} 
	});
	
	this.zwave.on('value added', function(nodeid, comclass, value) {
		device.nodes[nodeid][value.value_id] = value
	});
	
	this.zwave.connect(ZWAVE_PORT);
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
	
	if (device.command.toLowerCase() == "on" || device.command.toLowerCase() == "off") {
		// recherche d'une value Switch
		var metaSwitch = this.findValue(node, "Switch")
		
		if (metaSwitch) {
			var ids = this.parseIds(metaSwitch.value_id)
			this.zwave.setValue(ids.nodeId, ids.commandClass, ids.instance, ids.index,
					device.command.toLowerCase() == "on" ? true : false)
		}
	} else {
		// recherche d'une value Level
		var metaLevel = this.findValue(node, "Level")
		var value = this.convertValue(device.value)
		
		if (metaLevel) {
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
 * Convertit un node ZWave en device et envoit les infos au serveur
 * 
 */
ZWave.prototype.sendDeviceMetavalues = function(nodeId, metaName) {
	var node = this.nodes[nodeId]
	var device = new ZWave(this.server)
	device.label = node.productinfo.product
	device.mac = "zwave" + nodeId
	
	// TODO : voir si la règle s'applique aux autres devices
	var metaLevel = this.findValue(node, "Level")
	
	if (metaLevel) {
		device.value = metaLevel.value
	} else {
		device.value = 0
	}
	
	// envoi en plusieurs morceaux car sinon ca peut prendre un gros volume si beaucoup de valeurs
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
	device.label = node.productinfo.product
	device.mac = "zwave" + nodeId
	
	// envoi en plusieurs morceaux car sinon ca peut prendre un gros volume si beaucoup de valeurs
	for (valueName in node) {
		if (!metaName || metaName == valueName) {
			var metadata = node[valueName]
				
			if (this.isMetadata(metadata)) {
				var metavalue = {
						label: metadata.label + (metadata.units ? ' (' + metadata.units + ')' : ''),
						value: metadata.value != null ? metadata.value : null,
						help: metadata.help != null ? metadata.help : null,
						type: metadata.genre + ' (' + metadata.type + ')',
						values: metadata.values != null ? '' + metadata.values : null
				}
				
				// reset les valeurs précédentes
				device.metadatas = {}
				device.metadatas[valueName] = metavalue
				
				this.server.emit('value', device, 'deviceConfig')
			}
		}
	}
}


/**
 * 
 */
ZWave.prototype.isMetadata = function(metadata) { 
	return !metadata.read_only && metadata.type != 'button' && metadata.genre != 'user' && metadata.value_id
}


/**
 * 
 */
ZWave.prototype.isMetavalue = function(metadata) {
	return metadata.genre == 'user' && metadata.type != 'button'
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
ZWave.prototype.findValue = function(node, label) {
	for (valueName in node) {
		var metadata = node[valueName]
		if (metadata.label == label) {
			return metadata
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
