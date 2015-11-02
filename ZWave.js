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


var ZWAVE_PORT = "/dev/ttyUSB0";
var READ_INTERVAL = 60000 * 5;	// toutes les 5 minutes

/**
 * Constructor
 * @see Device
 */
var ZWave = function ZWave(server) {
	Device.call(this, null, true, server);
	this.metavalues = {};
	
	this.zwave = new OpenZWave({
        ConsoleOutput: false
	});
};

util.inherits(ZWave, Device);


/**
 * @see Device.init
 */
ZWave.prototype.init = function() {
	LOG.info(this, "Init");
	var device = this
	
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
		LOG.info(device, "Found new device", nodeid);
	});
	
	this.zwave.on('node ready', function(nodeid, nodeinfo) {
		LOG.info(device, "Device " + nodeid + "is ready", nodeinfo);
	});
	
	this.zwave.on('value changed', function(nodeid, comclass, value) {
		LOG.info(device, "Device value " + nodeid + "changed", {comclass: comclass, value: value});
	});
	
	this.zwave.on('value added', function(nodeid, comclass, value) {
		LOG.info(device, "Device value " + nodeid + "added", {comclass: comclass, value: value});
	});
	
	this.zwave.connect(ZWAVE_PORT);
};


/**
 * @see Device.free
 */
ZWave.prototype.free = function() {
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
	LOG.info(this, "Write " + device.value + " to " + device.mac);
};


/**
 * @see Device.startInclusion
 */
ZWave.prototype.startInclusion = function() {
	LOG.info("Starting inclusion...");
	this.zwave.addNode(false);
};


module.exports.ZWave = ZWave;
