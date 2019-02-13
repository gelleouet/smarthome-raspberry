var util = require('util');
var Parser = require("./Parser").Parser;

const BETWEEN_REGEX = /(#?[\w:\.()]+) between (#?[\w:\.()]+) and (#?[\w:\.()]+)/g

	
/**
 * OperatorParser
 * 
 * Transforme des opérateurs virtuels :
 * 	A between B and C =>  A >= B && A <= C
 * 
 */
var OperatorParser = function(teleinfo) {
	Parser.call(this);
	this.teleinfo = teleinfo
}

util.inherits(OperatorParser, Parser);


/**
 * Parsing d'une chaine de caractères pour transformation
 * 
 * @param str chaine de caractères
 * 
 * @return la chaine transformée
 */
OperatorParser.prototype.parse = function(str) {
	if (str.search(BETWEEN_REGEX) != -1) {
		str = str.replace(BETWEEN_REGEX, "$1 >= $2 && $1 <= $3")
	}
	return str
};


module.exports.OperatorParser = OperatorParser;