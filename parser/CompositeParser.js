var util = require('util');
var Parser = require("./Parser").Parser;


/**
 * Composite Parser
 * 
 * Délègue le parsing à une série de parsers
 */
var CompositeParser = function(parsers) {
	Parser.call(this);
	this.parsers = parsers
}

util.inherits(CompositeParser, Parser);


/**
 * Parsing d'une chaine de caractères pour transformation
 * 
 * @param str chaine de caractères
 * 
 * @return la chaine transformée
 */
CompositeParser.prototype.parse = function(str) {
	var result = str
	
	for (var i=0; i<this.parsers.length; i++) {
		result = this.parsers[i].parse(result)
	}
	
	return result
};


module.exports.CompositeParser = CompositeParser;