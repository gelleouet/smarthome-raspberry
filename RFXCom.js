/**
 * RFXCom
 * 
 * Implémentation Device pour la lecture/écriture module RFXCom
 * 
 * @see https://github.com/rfxcom/node-rfxcom
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var serialport = require("serialport");
var Device = require("./Device").Device;
var LOG = require("./Log").newInstance();
var DateUtils = require("./DateUtils").DateUtils;


var TELEINFO_CLASS = "smarthome.automation.deviceType.TeleInformation"
var COMPTEUR_CLASS = "smarthome.automation.deviceType.Compteur"
var TEMPERATURE_CLASS = "smarthome.automation.deviceType.Temperature"
var HUMIDITE_CLASS = "smarthome.automation.deviceType.Humidite"


/**
 * Constructor
 * @see Device
 */
var RFXCom = function RFXCom(server) {
	Device.call(this, null, true, server);
	var device = this
	
	this.metavalues = {}
	this.implClass = null
	this.receiving = false
	this.connected = false
	this.initialiseWaitTime = 6000
	this.seqnbr = 0
	this.initialising = false 
	this.onErrorWaitTime = 0
	// contient la date de la dernière valeur d'une mac
	this.lastDateValues = {}
	this.lastValues = {}
	
	this.handlers = {
		0x01: "statusMessageHandler",
		0x11: "lighting2Handler",
		0x50: "tempHandler",
		0x51: "humidityHandler",
		0x52: "temphumidityHandler",
		0x56: "windHandler",
		0x60: "cartelectronicHandler"
	}
	
	// démarre la connexion selon le protocole
	device.on("ready", function() {
		device.onErrorWaitTime = 0
		
		device.resetRFX(function(errReset) {
			if (errReset) {
				device.onError(errReset)
			} else {
				setTimeout(function() {
					device.flush(function(errFlush) {
						if (errFlush) {
							device.onError(errFlush)
						} else {
							device.receiving = true
							device.getRFXStatus(function(errStatus) {
								if (errStatus) {
									device.onError(errStatus)
								}
							})
						}
					})
				}, 500)
			}
		})
	})
	
	// redémarre auto la connexion
	// le temps entre chaque tentative augmente si plusieurs essais successifs en erreur
	device.on("close", function() {
		setTimeout(function() {
			device.init()
		}, device.onErrorWaitTime)
	})
};

util.inherits(RFXCom, Device);


/**
 * @see Device.init
 */
RFXCom.prototype.init = function() {
	var device = this;
	
	if (!device.credentials || !device.credentials.rfxcomPort) {
		LOG.error(device, "Port not defined !")
		return
	}
	
	// on quitte si déjà un process d'init en cours
	if (device.initialising) {
		return
	}
	
	device.initialising = true
	
	if (!device.object) {
		LOG.info(device, "Init on device port:", device.credentials.rfxcomPort);
		
		device.object = new serialport.SerialPort(device.credentials.rfxcomPort, {
			baudRate: 38400,
			dataBits: 8,
			parity: 'none',
			stopBits: 1,
			parser: device.parser()
		})
		
		
		// If the RFXTRX has just been connected, we must wait for at least 5s before any
        // attempt to communicate with it, or it will enter the flash bootloader.
        // We can't know how long it has been connected, so we must always wait!
		device.object.on('error', function(error) {
        	device.onError(error)
		})
		
        device.object.on("open", function (error) {
        	if (error) {
        		device.onError(error)
        	} else {
        		device.connected = true
                
        		device.object.on('close', function(error) {
                	device.onError(error)
                })
                
                device.object.on('data', function(data) {
					var length = data[0] + 1
		            var packetType = data[1]
					var handlerName = device.handlers[packetType]
					
		
			        // Avoid calling a handler with the wrong length packet
			        if (data.length !== length) {
			            LOG.error(device, "Wrong packet length: " + data.length + " bytes, should be " + length)
			        } else {
			            if (handlerName) {
			                try {
			                    device[handlerName](data.slice(2), packetType)
			                } catch (ex) {
			                	LOG.error(device, "Packet type " + handlerName, ex)
			                }
			            } else {
			                LOG.error(device, "Unhandled packet type " + packetType)
			            }
			        }
				})
        		
        		setTimeout(function () {
                	device.emit("ready")
                }, device.initialiseWaitTime - 500);
        	}
            
        })
	}
}

/**
* Calls flush on the underlying SerialPort.
*/
RFXCom.prototype.flush = function(callback) {
   if (this.object) {
	   try {
		   this.object.flush(callback)
	   } catch (ex) {
		   LOG.error(this, "Cannot flush buffer", ex)
		   if (callback) {
			   callback(ex)
		   }
	   }
   }
}


/**
 * Gestionnaire d'erreurs
 */
RFXCom.prototype.onError = function(error) {
	LOG.error(this, 'onError', error);
	this.close()
	
	// gestion du timer des retentatives
	// augmente le temps entre chaque tentative jusqu'à la limite haute de 1min
	if (this.onErrorWaitTime < 60000) {
		this.onErrorWaitTime += 5000
	}
	
	this.emit("close")
}


/**
 * Envoit la commande initiale RESET
 */
RFXCom.prototype.resetRFX = function(callback) {
	LOG.info(this, "Reset RFX")
	this.sendRFXMessage(0, 0, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0], callback)
}


/**
 * Sends the get status bytes to the interface.
 */
RFXCom.prototype.getRFXStatus = function(callback) {
	LOG.info(this, "Get RFX Status")
    this.sendRFXMessage(0, 0, 2, [0, 0, 0, 0, 0, 0, 0, 0, 0], callback)
}


/**
 * Sends the start receiver bytes to the interface.
 */
RFXCom.prototype.startRFXReceiver = function(callback) {
	LOG.info(this, "Start RFX Receiver")
    this.sendRFXMessage(0, 0, 7, [0, 0, 0, 0, 0, 0, 0, 0, 0], callback)
};


/**
 * Envoi message RFX
 */
RFXCom.prototype.sendRFXMessage = function(type, subtype, cmd, extra, callback) {
    var byteCount = extra.length + 4
    
    this.nextMessageSequenceNumber()
    var buffer = [byteCount, type, subtype, this.seqnbr, cmd]
    buffer = buffer.concat(extra)
    this.sendRFXBuffer(buffer, this.seqnbr, callback)
}


/**
 * Envoi buffer RFX
 */
RFXCom.prototype.sendRFXBuffer = function(buffer, seqnbr, callback) {
    if (this.object) {
    	try {
    		this.object.write(buffer, function (err, response) {
                if (callback) {
                    callback(err, response, seqnbr)
                }
            })
    	} catch (ex) {
    		LOG.error(this, "Cannot send buffer ", seqnbr)
    		if (callback) {
                callback(ex)
            }
    	}
    }
}


/**
 * Création d'un numéro de message
 */
RFXCom.prototype.nextMessageSequenceNumber = function() {
    if (this.seqnbr > 255) {
        this.seqnbr = 0
    }
    return this.seqnbr++
}


/**
 * Fermeture connexion série
 */
RFXCom.prototype.close = function() {
	if (this.object && this.object.isOpen()) {
		try {
			this.object.close()
		} catch (ex) {
			LOG.error(this, "Close serialport", ex)
		}
	}
	
	this.object = null
	this.connected = false
	this.receiving = false
	this.initialising = false 
}


/**
 * Le parser pour la réception des trames
 * 
 */
RFXCom.prototype.parser = function() {
    var data = []
    var requiredBytes = 0
    var device = this
    
    return function(emitter, buffer) {
        if (device.receiving) {
            data.push.apply(data, buffer)
            
            while (data.length >= requiredBytes) {
                if (requiredBytes > 0) {
                    emitter.emit("data", data.slice(0, requiredBytes))
                    data = data.slice(requiredBytes)
                }
                if (data.length > 0 && data[0] >= 4 && data[0] <= 36) {
                    requiredBytes = data[0] + 1
                } else {
                    requiredBytes = 0
                    data = []
                    break
                }
            }
        }
    }
}


/**
 * @see Device.free
 */
RFXCom.prototype.free = function() {
	LOG.info(this, "Free")
	this.close()
}


/**
 * @see Device.canWrite
 */
RFXCom.prototype.canWrite = function(device) {
	return false;
}


/**
 * @see Device.startInclusion
 */
RFXCom.prototype.startInclusion = function() {
	
};


/**
 * @see Device.startExclusion
 */
RFXCom.prototype.startExclusion = function() {
	
};


/**
 * @see config
 */
RFXCom.prototype.config = function(deviceMac, metadataName, metadataValue) {
	
};


/**
 * @see resetConfig
 */
RFXCom.prototype.resetConfig = function() {
	
};


/**
 * Called by the data event handler when data arrives from Cartelectronic smart-meter
 * interface transmitters (packet type 0x60).
 */
RFXCom.prototype.cartelectronicHandler = function(data, packetType) {
	var subtype = data[0]
	var now = new Date()
	
	
	// les compteurs impulsion
	if (subtype === 0x02) {
		var frequenceCompteur = this.server.frequence('compteur')
		var prefixmac = "counter_" + this.dumpHex(data.slice(2, 6), false).join("")
		var counter1 = (data[6] << 24) + (data[7] << 16) + (data[8] << 8) + data[9]
		var counter2 = (data[10] << 24) + (data[11] << 16) + (data[12] << 8) + data[13]
		var mac1 = prefixmac + "_1"
		var mac2 = prefixmac + "_2"
		
		if (this.checkFrequence(prefixmac, now, frequenceCompteur)) {
			if (counter1) {
				var value = {
					mac: mac1,
					implClass: this.server.deviceClass('compteur'),
					value: counter1 + "",
					metavalues: {
						battery: {
							label: 'Batterie',
							value: (data[15] & 0x0F) + ""
						},
						signal: {
							label: 'Signal',
							value: ((data[15] >> 4) & 0xF) + ""
						},
						conso: {
							value: this.lastValues[mac1] ? (counter1 - parseInt(this.lastValues[mac1].value)) + "" : "0",
		    				label: 'Période consommation',
		    				trace: true
						}
					}
				}
				
				this.server.emit("value", value)
				LOG.info(this, "Cartelectronic Counter", [value.mac, value.value, frequenceCompteur])
				this.lastValues[mac1] = value
			}
			
			if (counter2) {
				var value = {
					mac: mac2,
					implClass: this.server.deviceClass('compteur'),
					value: counter2 + "",
					metavalues: {
						battery: {
							label: 'Batterie',
							value: (data[15] & 0x0F) + ""
						},
						signal: {
							label: 'Signal',
							value: ((data[15] >> 4) & 0xF) + ""
						},
						conso: {
							value: this.lastValues[mac2] ? (counter2 - parseInt(this.lastValues[mac2].value)) + "" : "0",
		    				label: 'Période consommation',
		    				trace: true
						}
					}
				}
				
				this.server.emit("value", value)
				LOG.info(this, "Cartelectronic Counter", [value.mac, value.value, frequenceCompteur])
				this.lastValues[mac2] = value
			}
			
			if (counter1 || counter2) {
				this.lastDateValues[prefixmac] = now
			}
		}
	}
	// Teleinfo TIC
	else if (subtype == 0x01) {
		var frequenceTeleinfo = this.server.frequence('teleinfo')
		var mac = this.dumpHex(data.slice(2, 7), false).join("")
		var validPAPP = data[18] & 0x02 
        var validTIC = !(data[18] & 0x04)
        var papp = data[16]*256 + data[17]
		var contractType = data[7]
		
		// contrat = 4 bits de poids fort de cette variable
		// 0 = non défini
		// 1 = base
		// 2 = Creuse
		// 3 = EJP
		// 4 = TEMPO
		var opttarif = "NONE"
			
		switch((contractType >> 4) & 0x0F) {
			case 1: opttarif = "BASE"; break;
			case 2: opttarif = "HC"; break;
			case 3: opttarif = "EJP"; break;
			case 4: opttarif = "TEMPO"; break;
		}
		
		// Les périodes tarifaires (4 bits de poids faible)
		// PER_PAS_DEFINIE, = 0
		// PER_TOUTES_HEURES, //TH.. = 1
		// PER_HEURES_CREUSES, //HC.. = 2
		// PER_HEURES_PLEINES, HP.. = 3
		// PER_HEURES_NORMALES, HN.. = 4
		// PER_HEURES_POINTES_MOBILES, PM.. = 5
		//	PER_HEURES_CREUSES_BLEUES, HCJB = 6
		//	PER_HEURES_CREUSES_BLANCHES, HCJW  = 7
		//	PER_HEURES_CREUSES_ROUGES, HCJR = 8
		//	PER_HEURES_PLEINES_BLEUES, HPJB = 9
		//	PER_HEURES_PLEINES_BLANCHES, HPJW = 10
		//	PER_HEURES_PLEINES_ROUGES HPJR = 11:
		var ptec = "NONE"
		
		switch(contractType & 0x0F) {
			case 1: ptec = "TH"; break;
			case 2: ptec = "HC"; break;
			case 3: ptec = "HP"; break;
			case 4: ptec = "HN"; break;
			case 5: ptec = "PM"; break;
			case 6: ptec = "HCJB"; break;
			case 7: ptec = "HCJW"; break;
			case 8: ptec = "HCJR"; break;
			case 9: ptec = "HPJB"; break;
			case 10: ptec = "HPJW"; break;
			case 11: ptec = "HPJR"; break;
		}
        
        if (validPAPP && validTIC && this.checkFrequence(mac, now, frequenceTeleinfo)) {
        	var valueIndex1 = ((data[8] << 24) + (data[9] << 16) + (data[10] << 8) + data[11])
        	var valueIndex2 = ((data[12] << 24) + (data[13] << 16) + (data[14] << 8) + data[15])
        	
        	var value = {
        		mac: parseInt(mac, 16) + "",
        		implClass: this.server.deviceClass('teleinfo'),
        		value: Math.ceil(papp / 220) + "",
        		metavalues: {
					battery: {
						label: 'Batterie',
						value: (data[19] & 0x0F) + ""
					},
					signal: {
						label: 'Signal',
						value: ((data[19] >> 4) & 0xF) + ""
					},
					papp: {
						value: papp + "",
						label: "Puissance apparente",
						unite: "VA"
					},
					opttarif: {
						value: opttarif,
						label: "Option tarifaire"
					},
					ptec: {
						value: ptec,
						label: "Période tarifaire"
					}
				}
        	}
        	
        	// ajout des index totaux et période en fonction de la période tarifaire
        	if (opttarif == "HC") {
        		value.metavalues.hchc = {
        			value: valueIndex1 + "",
					label: "Total heures creuses",
					unite: "Wh",
					trace: true
				}
        		value.metavalues.hchp = {
        			value: valueIndex2 + "",
					label: "Total heures pleines",
					unite: "Wh",
					trace: true
				}
        		value.metavalues.hcinst = {
    				value: (this.lastValues[mac] && this.lastValues[mac].metavalues.hchc) ? (valueIndex1 - parseInt(this.lastValues[mac].metavalues.hchc.value)) + "" : "0",
    				label: 'Période heures creuses',
    				unite: 'Wh',
    				trace: true
    			}
        		value.metavalues.hpinst = {
    				value: (this.lastValues[mac] && this.lastValues[mac].metavalues.hchp) ? (valueIndex2 - parseInt(this.lastValues[mac].metavalues.hchp.value)) + "" : "0",
					label: 'Période heures pleines',
					unite: 'Wh',
					trace: true
        		}
        	} else if (opttarif == "EJP") {
        		value.metavalues.hchc = {
        			value: valueIndex2 + "",
					label: "Total heures normales",
					unite: "Wh",
					trace: true
				}
        		value.metavalues.hchp = {
        			value: valueIndex1 + "",
					label: "Total heures pointe mobile",
					unite: "Wh",
					trace: true
				}
        		value.metavalues.hcinst = {
    				value: (this.lastValues[mac] && this.lastValues[mac].metavalues.hchc) ? (valueIndex2 - parseInt(this.lastValues[mac].metavalues.hchc.value)) + "" : "0",
    				label: 'Période heures creuses',
    				unite: 'Wh',
    				trace: true
    			}
        		value.metavalues.hpinst = {
    				value: (this.lastValues[mac] && this.lastValues[mac].metavalues.hchp) ? (valueIndex1 - parseInt(this.lastValues[mac].metavalues.hchp.value)) + "" : "0",
					label: 'Période heures pleines',
					unite: 'Wh',
					trace: true
        		}
            } else {
        		value.metavalues.base = {
        			value: valueIndex1 + "",
					label: "Total toutes heures",
					unite: "Wh",
					trace: true
				}
        		value.metavalues.baseinst = {
    				value: (this.lastValues[mac] && this.lastValues[mac].metavalues.base) ? (valueIndex1 - parseInt(this.lastValues[mac].metavalues.base.value)) + "" : "0",
    				label: 'Période toutes heures',
    				unite: 'Wh',
    				trace: true
    			}
        	}
        	
        	this.server.emit("value", value)
			LOG.info(this, "Cartelectronic TIC", [value.mac, value.value, frequenceTeleinfo])
			this.lastDateValues[mac] = now
			this.lastValues[mac] = value
        }
	}
}


/**
 * Called by the data event handler when data arrives from a HomeEasy
 * light control device (packet type 0x11).
 */
RFXCom.prototype.lighting2Handler = function(data, packetType) {
	var idBytes = data.slice(2, 6)
	idBytes[0] &= ~0xfc;
	var unitCode = data[6]
    var mac = this.dumpHex(idBytes, false).join("") + "_" + unitCode
    var commands = {
        0: "Off",
        1: "On",
        2: "Set Level",
        3: "Group Off",
        4: "Group On",
        5: "Set Group Level"
    }
	var now = new Date()

	var message = {
		implClass: this.server.deviceClass('capteur'),
		mac: mac,
		value: data[7] + "",
		metavalues: {
			signal: {
				label: 'Signal',
				value: data[8] + ""
			}
		}
	}
	
	this.server.emit("value", message)
	LOG.info(this, "Chacon - DiO", [message.mac, message.value])
	this.lastDateValues[mac] = now
}


/**
 * Called by the data event handler when data arrives from temperature
 * sensing devices (packet type 0x50).
*/
RFXCom.prototype.tempHandler = function(data, packetType) {
	var frequenceTemp = this.server.frequence('temperature')
	var now = new Date()
	var mac = "temp_" + this.dumpHex(data.slice(2, 4), false).join("")
	var signbit = data[4] & 0x80
	var temperature = ((data[4] & 0x7f) * 256 + data[5]) / 10 * (signbit ? -1 : 1)
	
	if (this.checkFrequence(mac, now, frequenceTemp)) {
		var tempValue = {
			implClass: this.server.deviceClass('temperature'),
			mac: mac,
			value: temperature + "",
			metavalues: {
				battery: {
					label: 'Batterie',
					value: (data[6] & 0x0f) + ""
				},
				signal: {
					label: 'Signal',
					value: ((data[6] >> 4) & 0xf) + ""
				}
			}
		}
		
		this.server.emit("value", tempValue)
		LOG.info(this, "Temperature", [tempValue.mac, tempValue.value, frequenceTemp])
		this.lastDateValues[mac] = now
	}
}


/**
 * Called by the data event handler when data arrives from humidity sensing
 * devices (packet type 0x51).
 */
RFXCom.prototype.humidityHandler = function(data, packetType) {
	var frequenceTemp = this.server.frequence('humidite')
	var now = new Date()
	var mac = "humid_" + this.dumpHex(data.slice(2, 4), false).join("")
	
	if (this.checkFrequence(mac, now, frequenceTemp)) {
		var tempValue = {
			implClass: this.server.deviceClass('humidite'),
			mac: mac,
			value: data[4] + "",
			metavalues: {
				battery: {
					label: 'Batterie',
					value: (data[6] & 0x0f) + ""
				},
				signal: {
					label: 'Signal',
					value: ((data[6] >> 4) & 0xf) + ""
				}
			}
		}
		
		this.server.emit("value", tempValue)
		LOG.info(this, "Humidite", [tempValue.mac, tempValue.value, frequenceTemp])
		this.lastDateValues[mac] = now
	}
}


/**
 * Called by the data event handler when data arrives from wind speed & direction
 * sensors (packet type 0x56).
 */
RFXCom.prototype.windHandler = function(data, packetType) {
	var frequenceTemp = this.server.frequence('anemometre')
	var now = new Date()
	var mac = "wind_" + this.dumpHex(data.slice(2, 4), false).join("")
	
	if (this.checkFrequence(mac, now, frequenceTemp)) {
		var tempValue = {
			implClass: this.server.deviceClass('anemometre'),
			mac: mac,
			value: ((data[8]*256 + data[9])/10 * 3.6) + "", // m/s => en km/h (ie * 3.6)
			metavalues: {
				battery: {
					label: 'Batterie',
					value: (data[14] & 0x0f) + ""
				},
				signal: {
					label: 'Signal',
					value: ((data[14] >> 4) & 0xf) + ""
				},
				direction: {
					label: 'Direction',
					value: (data[4]*256 + data[5]) + ""
				}
			}
		}
		
		this.server.emit("value", tempValue)
		LOG.info(this, "Anemometre", [tempValue.mac, tempValue.value, frequenceTemp])
		this.lastDateValues[mac] = now
	}
}


/**
 * Called by the data event handler when data arrives from temperature & humidty sensing
 * devices (packet type 0x52).
 */
RFXCom.prototype.temphumidityHandler = function(data, packetType) {
    var frequenceTemp = this.server.frequence('temperature')
    var frequenceHum = this.server.frequence('humidite')
    var now = new Date()
    
    // les channels sont codés en binaire
    // l'indice du bit indique le n° de channel
    var channel = data[3]
    
    if (channel & 0x04) {
    	channel = 3
    } else if (channel & 0x08) {
    	channel = 4
    }
	
    var macTemp = 'temp_' + this.dumpHex(data.slice(2, 4), false).join("") + '_' + channel
	var macHum = 'hum_' + this.dumpHex(data.slice(2, 4), false).join("") + '_' + channel
	var temperature
	
	// BYTE temperaturehigh : 7;
	// BYTE temperaturesign : 1;
	// BYTE temperaturelow;
	// 7 bits high byte and 8 bits low byte = temperature * 10
	if ((data[4] & 0x80) == 0) {
		temperature = ((data[4] * 256) + data[5]) / 10 
	} else {
		temperature = (((data[4] & 0x7F) * 256) + data[5]) / -10
	}
	
	if (this.checkFrequence(macTemp, now, frequenceTemp)) {
		var tempValue = {
			implClass: this.server.deviceClass('temperature'),
			mac: macTemp,
			value: temperature + "",
			metavalues: {
				battery: {
					label: 'Batterie',
					value: (data[8] & 0x0F) + ""
				},
				signal: {
					label: 'Signal',
					value: ((data[8] >> 4) & 0xF) + ""
				}
			}
		}
		
		this.server.emit("value", tempValue)
		LOG.info(this, "Oregon Scientific Temperature", [tempValue.mac, tempValue.value, frequenceTemp])
		this.lastDateValues[macTemp] = now
	}
    
	if (this.checkFrequence(macHum, now, frequenceHum)) {
		var humValue = {
			implClass: this.server.deviceClass('humidite'),
			mac: macHum,
			value: data[6] + "",
			metavalues: {
				battery: {
					label: 'Batterie',
					value: (data[8] & 0x0F) + ""
				},
				signal: {
					label: 'Signal',
					value: ((data[8] >> 4) & 0xF) + ""
				}
			}
		}
		
		this.server.emit("value", humValue)
		LOG.info(this, "Oregon Scientific Humidite", [humValue.mac, humValue.value, frequenceHum])
		this.lastDateValues[macHum] = now
	}
}


/**
 * Called by the data event handler when an Interface Response Message arrives
 * from the device.
 */
RFXCom.prototype.statusMessageHandler = function(data) {
    var subtype = data[0]
    var seqnbr = data[1]
    var cmnd = data[2]
    var copyrightText
    
    if (subtype === 0x07) {  // Start receiver response (should return copyright message)
        copyrightText = String.fromCharCode.apply(String, data.slice(3, 19));
        
        if (copyrightText === "Copyright RFXCOM") {
        	LOG.info(this, copyrightText)
            this.initialising = false
        } else {
        	LOG.error(this, "Invalid start receiver response ", copyrightText)
        	this.onError()
        }
    } else if (subtype === 0x00) {  // Mode command response
        this.startRFXReceiver(function (err) {
            if (err) {
                this.onError(err)
            }
        })
    } 
}


/**
 * Formattage en hexa
 */
RFXCom.prototype.dumpHex = function(buffer, prefix) {
    prefix = prefix || "";

    function dec2hex(value) {
        const hexDigits = "0123456789ABCDEF";
        return prefix + (hexDigits[value >> 4] + hexDigits[value & 15]);
    }
    return buffer.map(dec2hex);
}


/**
 * Verifie si une valeur peut être envoyée à condition que la période minimale
 * soit écoulée
 */
RFXCom.prototype.checkFrequence = function(mac, now, frequence) {
	return !this.lastDateValues[mac] || DateUtils.diffSecond(this.lastDateValues[mac], now) >= frequence
}


module.exports.RFXCom = RFXCom;
