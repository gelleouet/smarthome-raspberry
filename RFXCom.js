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
var SerialPort = require("serialport");
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
	this.data = []
	this.requiredBytes = 0
	
	this.handlers = {
		0x01: "statusMessageHandler",
		0x52: "temphumidityHandler",
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
	
	
	device.on("data", function(data) {
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
		
		device.object = new SerialPort(device.credentials.rfxcomPort, {
			baudRate: 38400,
			dataBits: 8,
			parity: 'none',
			stopBits: 1
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
        		
        		device.object.on("data", function(buffer) {
        			device.onSerialData(buffer)
        		})
                
        		device.object.on('close', function(error) {
                	device.onError(error)
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
	if (this.object && this.object.isOpen) {
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
						}
					}
				}
				
				this.server.emit("value", value)
				LOG.info(this, "Cartelectronic Counter", [value.mac, value.value, frequenceCompteur])
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
						}
					}
				}
				
				this.server.emit("value", value)
				LOG.info(this, "Cartelectronic Counter", [value.mac, value.value, frequenceCompteur])
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
					hchc: {
						value: ((data[8] << 24) + (data[9] << 16) + (data[10] << 8) + data[11]) + "",
						label: "Total heures creuses (Wh)",
						trace: true
					},
					hchp: {
						value: ((data[12] << 24) + (data[13] << 16) + (data[14] << 8) + data[15]) + "",
						label: "Total heures pleines (Wh)",
						trace: true
					},
					papp: {
						value: papp + "",
						label: "Puissance apparente (VA)"
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
        	
        	this.server.emit("value", value)
			LOG.info(this, "Cartelectronic TIC", [value.mac, value.value, frequenceTeleinfo])
			this.lastDateValues[mac] = now
        }
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
	
	var macTemp = 'temp_channel_' + channel
	var macHum = 'hum_channel_' + channel
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


/**
 * Le parser pour la réception des trames
 * 
 */
RFXCom.prototype.onSerialData = function(buffer) {
	if (this.receiving) {
        this.data.push.apply(this.data, buffer)
        
        while (this.data.length >= this.requiredBytes) {
            if (this.requiredBytes > 0) {
            	this.emit("data", this.data.slice(0, this.requiredBytes))
                this.data = this.data.slice(this.requiredBytes)
            }
            if (this.data.length > 0 && this.data[0] >= 4 && this.data[0] <= 36) {
                this.requiredBytes = this.data[0] + 1
            } else {
                this.requiredBytes = 0
                this.data = []
                break
            }
        }
    }
}


module.exports.RFXCom = RFXCom;
