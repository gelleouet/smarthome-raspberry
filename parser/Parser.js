var util = require('util');


/**
 * Parser : classe de base pour le parsing
 */
var Parser = function() {
	
}


/**
 * Parsing d'une chaine de caractères pour transformation
 * 
 * @param str chaine de caractères
 * 
 * @return la chaine transformée
 */
Parser.prototype.parse = function(str) {
	return str
};


module.exports.Parser = Parser;