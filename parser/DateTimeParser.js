var util = require('util');
var Parser = require("./Parser").Parser;


/**
 * TimeParser
 * 
 * Transforme les valeurs de type :
 * 	#hour => this.datetime.getHours()
 * 	#minute => this.datetime.getMinutes()
 * 	#time => l'opérande droite doit être au format hh:mm pour faire une comparaison heure et minute
 * 		
 */
var DateTimeParser = function(datetime) {
	Parser.call(this);
	this.datetime = datetime
}

util.inherits(DateTimeParser, Parser);


/**
 * Parsing d'une chaine de caractères pour transformation
 * 
 * @param str chaine de caractères
 * 
 * @return la chaine transformée
 */
DateTimeParser.prototype.parse = function(str) {
	str = str.replace(/#time/g, (this.datetime.getHours() * 60) + this.datetime.getMinutes())
	str = str.replace(/(\d\d):(\d\d)/g, "(($1 * 60) + $2)")
	return str
};


module.exports.DateTimeParser = DateTimeParser;