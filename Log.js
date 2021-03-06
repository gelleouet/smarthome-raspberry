/**
 * Log
 * 
 * Classe utilitaire pour centraliser l'affichage de logs formattés
 * 
 * @author gregory.elleouet@gmail.com
 */


/**
 * Constructor
 */
var Log = function() {
	
};


/**
 * Print a INFO message
 * 
 * @param object
 * @param message
 */
Log.prototype.info = function(object, message, data) {
	if (data != null) {
		console.log(this.build(object, message, "INFO"), data);
	} else {
		console.log(this.build(object, message, "INFO"));
	}
};


/**
 * Print a ERROR message
 * 
 * @param object
 * @param message
 */
Log.prototype.error = function(object, message, data) {	
	if (data) {
		console.log(this.build(object, message, "ERROR"), data);
	} else {
		console.log(this.build(object, message, "ERROR"));
	}
};


/**
 * Construit un message
 */
Log.prototype.build = function(object, message, type) {
	var buffer = "[" + type + " ";
	var strDate = new Date().toLocaleString()
	var gmtIndex = strDate.indexOf("GMT")
	
	if (gmtIndex != -1) {
		strDate = strDate.slice(0, gmtIndex-1)
	}
	buffer += strDate + "] ";
	buffer += object.constructor.name + " - ";
	
	return buffer + message;
};


module.exports.Log = Log;
module.exports.newInstance = function() {
	return new Log();
};
