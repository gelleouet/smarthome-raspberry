var assert = require('assert');
//var DeviceServer = require("../../DeviceServer")
//var TeleInfo = require("./TeleInfo").TeleInfo;
var GestionnaireEnergie = require("../../GestionnaireEnergie").GestionnaireEnergie


/**
 * tests unitaires sur le gestionnaire énergie
 */
describe('GestionnaireEnergie', function() {
	var config = {
			
	}
	//var deviceServer = DeviceServer.newInstance(config)
	//var teleInfo = new TeleInfo(deviceServer, 1)
	var ge = new GestionnaireEnergie(null, null)
	
	
	before(function() {
		
	})
	
	
	describe('executeRule', function() {
		it('Teleinfo empty => false', function() {
			assert.equal(ge.executeRule("", {}), false)
    	})
    	
    	it('Rule empty => false', function() {
			assert.equal(ge.executeRule("", null), false)
    	})
    	
		it('Rule [HC], contexte [HP] => false', function() {
			assert.equal(ge.executeRule("isHC()", {ptec: {value: "HP"}}), false)
    	})
    	
    	it('Rule [HC], contexte [HC] => true', function() {
			assert.equal(ge.executeRule("isHC()", {ptec: {value: "HC"}}), true)
    	})
    	
    	it('Rule [HC entre 0H et 3H], contexte [HP à 1H] => false', function() {
    		var rule = "isHC() && #time between 00:00 and 03:00"
    		var dateRule = new Date(2018, 11, 12, 1)
    		assert.equal(ge.executeRule(rule, {ptec: {value: "HP"}}, dateRule), false)
    	})
    	
    	it('Rule [HC entre 0H et 3H], contexte [HC à 3H05] => false', function() {
    		var rule = "isHC() && #time between 00:00 and 03:00"
    		var dateRule = new Date(2018, 11, 12, 3, 5)
    		assert.equal(ge.executeRule(rule, {ptec: {value: "HC"}}, dateRule), false)
    	})
    	
    	it('Rule [HC entre 0H et 3H], contexte [HC à 2H] => true', function() {
    		var rule = "isHC() && #time between 00:00 and 03:00"
    		var dateRule = new Date(2018, 11, 12, 2)
    		assert.equal(ge.executeRule(rule, {ptec: {value: "HC"}}, dateRule), true)
    	})
    	
    	it('Rule [si chauffage HC entre 0H et 3H, sinon HC entre 3H30 et 6h30], contexte [chauffage HC à 2H] => true', function() {
    		var rule = "if (isChauffage()) { isHC() && #time between 00:00 and 03:00 } else { isHC() && #time between 03:30 and 06:30 }"
    		var dateRule = new Date(2018, 11, 12, 2)
    		ge.setChauffageMode("on")
    		assert.equal(ge.executeRule(rule, {ptec: {value: "HC"}}, dateRule), true)
    	})
    	
    	it('Rule [si chauffage HC entre 0H et 3H, sinon HC entre 3H30 et 6h30], contexte [chauffage HC à 3H05] => false', function() {
    		var rule = "if (isChauffage()) { isHC() && #time between 00:00 and 03:00 } else { isHC() && #time between 03:30 and 06:30 }"
    		var dateRule = new Date(2018, 11, 12, 3, 5)
    		ge.setChauffageMode("on")
    		assert.equal(ge.executeRule(rule, {ptec: {value: "HC"}}, dateRule), false)
    	})
    	
    	it('Rule [si chauffage HC entre 0H et 3H, sinon HC entre 3H30 et 6h30], contexte [no chauffage HC à 2H] => false', function() {
    		var rule = "if (isChauffage()) { isHC() && #time between 00:00 and 03:00 } else { isHC() && #time between 03:30 and 06:30 }"
    		var dateRule = new Date(2018, 11, 12, 2)
    		ge.setChauffageMode("off")
    		assert.equal(ge.executeRule(rule, {ptec: {value: "HC"}}, dateRule), false)
    	})
    	
    	it('Rule [si chauffage HC entre 0H et 3H, sinon HC entre 3H30 et 6h30], contexte [no chauffage HC à 3H05] => true', function() {
    		var rule = "if (isChauffage()) { isHC() && #time between 00:00 and 03:00 } else { isHC() && #time between 03:30 and 06:30 }"
    		var dateRule = new Date(2018, 11, 12, 3, 35)
    		ge.setChauffageMode("off")
    		assert.equal(ge.executeRule(rule, {ptec: {value: "HC"}}, dateRule), true)
    	})
	})
	
})