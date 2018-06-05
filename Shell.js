/**
 * Shell
 * 
 * Exécution d'un terminal sur le raspberry pour prise de controle à distance
 * 
 * @author gregory.elleouet@gmail.com
 */
var pty = require('pty');
var Device = require("./Device").Device;
var LOG = require("./Log").newInstance();


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
	// demande nouvelle connexion
	if (data == 'connect-shell') {
		// on vérifie si déjà connecté
		if (this.xterm) {
			this.free()
		}
		this.connect()
	} else {
		if (!this.xterm) {
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
	if (this.xterm) {
		this.xterm.destroy()
		this.xterm = null
	}
};


/**
 * Envoi d'un message au serveur
 * 
 * @param data
 */
Shell.prototype.sendData = function(data) {
	var device = new Device('xterm-color', true, this.server)
	device.value = data
	this.server.emit('value', device, 'shell')
};


/**
 * Arrêt du shell
 * 
 * @param data
 */
Shell.prototype.connect = function() {
	var shell = this
	
	LOG.info(shell, "New bash console");
	
	this.xterm = pty.spawn('bash', [], {
	  name: 'xterm-color',
	  cols: 80,
	  rows: 80,
	  cwd: process.env.HOME,
	  env: process.env
	})
	
	// a chaque réception de data, on renvoit le tout au serveur principal
	this.xterm.on('data', function(data) {
		shell.sendData(data)
	});
};


module.exports.Shell = Shell;
