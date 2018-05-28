/**
 * DateUtils
 * 
 * Utilitaires sur date
 * 
 * @author gregory.elleouet@gmail.com
 */

/**
 * Constructor
 */
var DateUtils = function DateUtils() {
	
}


/**
 * Différence en secondes entre 2 dates
 * 
 * @param dateStart
 * @param dateEnd
 * 
 */
DateUtils.prototype.diffSecond = function(dateStart, dateEnd) {
	var diff = dateEnd.getTime() - dateStart.getTime()
	return diff / 1000
}


/**
 * Différence en secondes entre 2 dates
 * 
 * @param dateStart
 * @param dateEnd
 * 
 */
DateUtils.prototype.diffMilliSecond = function(dateStart, dateEnd) {
	return dateEnd.getTime() - dateStart.getTime()
}


module.exports.DateUtils = new DateUtils()
