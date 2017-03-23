/**
 * Shell
 * 
 * Exécution d'un terminal sur le raspberry pour prise de controle à distance
 * 
 * @author gregory.elleouet@gmail.com
 */
var pty = require('pty.js');
var Device = require("./Device").Device;


/**
 * Constructor
 */
var Shell = function Shell(server) {
	this.server = server
	
	this.xterm = pty.spawn('bash', [], {
	  name: 'xterm-color',
	  cols: 80,
	  rows: 30,
	  cwd: process.env.HOME,
	  env: process.env
	})
	
	// a chaque réception de data, on revoit le tout au serveur principal
	this.xterm.on('data', function(data) {
		var device = new Device('xterm-color', true, server)
		device.value = data
		server.emit('value', device, 'shell')
	});
};


/**
 * Envoit des data sur le terminal
 * 
 * @param data
 */
Log.prototype.write = function(data) {
	this.xterm.write(data)
};


/**
 * Arrêt du shell
 * 
 * @param data
 */
Log.prototype.free = function() {
	this.xterm.destroy()
};


module.exports.Shell = Shell;
