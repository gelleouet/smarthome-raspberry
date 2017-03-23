/**
 * Shell
 * 
 * Exécution d'un terminal sur le raspberry pour prise de controle à distance
 * 
 * @author gregory.elleouet@gmail.com
 */
var pty = require('pty');
var Device = require("./Device").Device;


/**
 * Constructor
 */
var Shell = function Shell(server) {
	this.server = server
	this.xterm = null
};


/**
 * Envoit des data sur le terminal
 * 
 * @param data
 */
Shell.prototype.write = function(data) {
	if (data == "close") {
		this.free()
	} else {
		// on vérifie si déjà connecté
		if (! this.xterm) {
			this.connect()
		}
		this.xterm.write(data)
	}
};


/**
 * Arrêt du shell
 * 
 * @param data
 */
Shell.prototype.free = function() {
	this.xterm.destroy()
	this.xterm = null
};


/**
 * Arrêt du shell
 * 
 * @param data
 */
Shell.prototype.connect = function() {
	this.xterm = pty.spawn('bash', [], {
	  name: 'xterm-color',
	  cols: 80,
	  rows: 30,
	  cwd: process.env.HOME,
	  env: process.env
	})
	
	// a chaque réception de data, on renvoit le tout au serveur principal
	this.xterm.on('data', function(data) {
		var device = new Device('xterm-color', true, server)
		device.value = data
		server.emit('value', device, 'shell')
	});
};


module.exports.Shell = Shell;
