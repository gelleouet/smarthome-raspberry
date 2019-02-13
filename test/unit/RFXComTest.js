var assert = require('assert');
var RFXCom = require("../../RFXcom").RFXCom
var DeviceServer = require('../../DeviceServer')

/**
 * tests unitaires sur le récepteur RFXCom
 */
describe('RFXCom', function() {
	var config = {
			
	}
	
	var deviceServer = DeviceServer.newInstance({
		
	})
	var rfxcom = new RFXCom(deviceServer)
	var mac = '09B340DE0E'
	
	
	before(function() {
		
	})
	
	
	/**
	 * Tests sur le TIC Cartelectronic
	 */
	describe('cartelectronicHandler TIC', function() {
		it('Contrat BASE index 1000000', function() {
			var data = [ 0x01,	// 0 subtype
			             0x00, 	// 1 ?
			             0x09,	// 2 à 6 mac : 09B340DE0E
			             0xB3,
			             0x40,
			             0xDE,
			             0x0E,
			             0x11,	// 7 contractType : opttarif + périod : BASE TH
			             0x00,	// 8 à 11 index 1 : 1 000 000
			             0x0F,
			             0x42,
			             0x40,
			             0x00,	// 12 à 15 index 2
			             0x00,
			             0x00,
			             0x00,
			             0x00,	// 16-17 papp
			             0x00,
			             0x02	// flag tic present et valid papp
			];
			
			// 1ere lecture sans erreur car la trame est complète avec son index
			assert.doesNotThrow(function() {
				rfxcom.cartelectronicHandler(data, 0x00);
			})
    	})
    	
    	
    	it('Contrat BASE index 999999', function() {
    		var data = [ 0x01,	// 0 subtype
    		         0x00, 	// 1 ?
    		         0x09,	// 2 à 6 mac : 09B340DE0E
    		         0xB3,
    		         0x40,
    		         0xDE,
    		         0x0E,
    		         0x11,	// 7 contractType : opttarif + périod : BASE TH
    		         0x00,	// 8 à 11 index 1 : 999 999
    		         0x0F,
    		         0x42,
    		         0x3F,
    		         0x00,	// 12 à 15 index 2
    		         0x00,
    		         0x00,
    		         0x00,
    		         0x00,	// 16-17 papp
    		         0x00,
    		         0x02	// flag tic present et valid papp
    		         ];
    		
    		// reset de la date pour autoriser la 2e lecture
    		rfxcom.lastDateValues[mac] = new Date(1970, 0, 1)
    		
    		// 2e lecture avec erreur car l'index est inférieur au 1er
    		assert.throws(function() {
    			rfxcom.cartelectronicHandler(data, 0x00);
    		})
    	})
    	
    	
    	it('Contrat BASE conso 0', function() {
    		var data = [ 0x01,	// 0 subtype
    		         0x00, 	// 1 ?
    		         0x09,	// 2 à 6 mac : 09B340DE0E
    		         0xB3,
    		         0x40,
    		         0xDE,
    		         0x0E,
    		         0x11,	// 7 contractType : opttarif + périod : BASE TH
    		         0x00,	// 8 à 11 index 1 : 1 000 010
    		         0x0F,
    		         0x42,
    		         0x4A,
    		         0x00,	// 12 à 15 index 2
    		         0x00,
    		         0x00,
    		         0x00,
    		         0x00,	// 16-17 papp
    		         0x00,
    		         0x02	// flag tic present et valid papp
    		         ];
    		
    		// reset de la date pour autoriser la 2e lecture
    		rfxcom.lastDateValues[mac] = new Date(1970, 0, 1)
    		
    		var results = {}
    		
    		// 3e lecture ok mais sans conso car la dernière lecture date de 1970
    		assert.doesNotThrow(function() {
    			results = rfxcom.cartelectronicHandler(data, 0x00);
    		})
    		
    		assert.ok(results[mac])
    		assert.ok(results[mac].metavalues)
    		assert.ok(results[mac].metavalues.baseinst)
    		assert.ok(results[mac].metavalues.baseinst.value)
    		assert.equal(results[mac].metavalues.baseinst.value, "0")
    	})
    	
    	
    	it('Contrat BASE conso 20', function() {
    		var data = [ 0x01,	// 0 subtype
    		         0x00, 	// 1 ?
    		         0x09,	// 2 à 6 mac : 09B340DE0E
    		         0xB3,
    		         0x40,
    		         0xDE,
    		         0x0E,
    		         0x11,	// 7 contractType : opttarif + périod : BASE TH
    		         0x00,	// 8 à 11 index 1 : 1 000 030
    		         0x0F,
    		         0x42,
    		         0x5E,
    		         0x00,	// 12 à 15 index 2
    		         0x00,
    		         0x00,
    		         0x00,
    		         0x00,	// 16-17 papp
    		         0x00,
    		         0x02	// flag tic present et valid papp
    		         ];
    		
    		// reset de la date pour autoriser la nouvelle lecture
    		rfxcom.lastDateValues[mac].setMinutes(rfxcom.lastDateValues[mac].getMinutes() - 5)
    		
    		var results = {}
    		
    		// 4e lecture normale
    		assert.doesNotThrow(function() {
    			results = rfxcom.cartelectronicHandler(data, 0x00);
    		})
    		
    		assert.ok(results[mac])
    		assert.ok(results[mac].metavalues)
    		assert.ok(results[mac].metavalues.baseinst)
    		assert.ok(results[mac].metavalues.baseinst.value)
    		assert.equal(results[mac].metavalues.baseinst.value, "20")
    	})
	})
	
})