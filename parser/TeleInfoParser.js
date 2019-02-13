var util = require('util');
var Parser = require("./Parser").Parser;


/**
 * TeleInfoParser
 * 
 * Transforme les valeurs de type :
 * 	#ptec => this.teleinfo.ptect.value
 * 	et pour toutes les autres valeurs d'un objet teleinfo (base, hphp, hphc, adps, etc.)
 */
var TeleInfoParser = function(teleinfo) {
	Parser.call(this);
	this.teleinfo = teleinfo
}

util.inherits(TeleInfoParser, Parser);


/**
 * Parsing d'une chaine de caractères pour transformation
 * 
 * @param str chaine de caractères
 * 
 * @return la chaine transformée
 */
TeleInfoParser.prototype.parse = function(str) {
	if (this.teleinfo.ptec) {
		str = str.replace(/#ptec/g, "'" + this.teleinfo.ptec.value + "'")
			.replace(/isHC\(\)/g, "'" + this.teleinfo.ptec.value + "' == 'HC'")
			.replace(/isHP\(\)/g, "'" + this.teleinfo.ptec.value + "' == 'HP'")
	}
	if (this.teleinfo.papp) {
		str = str.replace(/#papp/g, this.teleinfo.papp.value)
	}
	if (this.teleinfo.iinst) {
		str = str.replace(/#iinst/g, this.teleinfo.iinst.value)
	}
	if (this.teleinfo.adps) {
		str = str.replace(/#adps/g, this.teleinfo.adps.value)
	}
	if (this.teleinfo.hcinst) {
		str = str.replace(/#hcinst/g, this.teleinfo.hcinst.value)
	}
	if (this.teleinfo.hpinst) {
		str = str.replace(/#hpinst/g, this.teleinfo.hpinst.value)
	}
	if (this.teleinfo.baseinst) {
		str = str.replace(/#baseinst/g, this.teleinfo.baseinst.value)
	}
	return str
};


module.exports.TeleInfoParser = TeleInfoParser;