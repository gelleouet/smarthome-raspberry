/**
 * BME280
 * 
 * Implémentation I2C pour le composant BME280
 * 
 * 
 * @author gregory.elleouet@gmail.com
 */
var util = require('util');
var Device = require("../Device").Device;
var LOG = require("../Log").newInstance();


var SMARTHOME_CLASS_TEMP = "smarthome.automation.deviceType.Temperature";
var SMARTHOME_CLASS_HUMD = "smarthome.automation.deviceType.Humidite";
var SMARTHOME_CLASS_PRES = "smarthome.automation.deviceType.Pression";
	
var I2C_ADDRESS_B   = 0x76;
var I2C_ADDRESS_A   = 0x77;
var CHIP_ID         = 0x58;
var CHIP_ID_BME280  = 0x60;

var REGISTER_DIG_T1 = 0x88;
var REGISTER_DIG_T2 = 0x8A;
var REGISTER_DIG_T3 = 0x8C;

var REGISTER_DIG_P1 = 0x8E;
var REGISTER_DIG_P2 = 0x90;
var REGISTER_DIG_P3 = 0x92;
var REGISTER_DIG_P4 = 0x94;
var REGISTER_DIG_P5 = 0x96;
var REGISTER_DIG_P6 = 0x98;
var REGISTER_DIG_P7 = 0x9A;
var REGISTER_DIG_P8 = 0x9C;
var REGISTER_DIG_P9 = 0x9E;

var REGISTER_DIG_H1 = 0xA1;
var REGISTER_DIG_H2 = 0xE1;
var REGISTER_DIG_H3 = 0xE3;
var REGISTER_DIG_H4 = 0xE4;
var REGISTER_DIG_H5 = 0xE5;
var REGISTER_DIG_H6 = 0xE7;

var REGISTER_CHIPID = 0xD0;
var REGISTER_RESET  = 0xE0;

var REGISTER_CONTROL_HUM   = 0xF2;
var REGISTER_CONTROL       = 0xF4;
var REGISTER_PRESSURE_DATA = 0xF7;
var REGISTER_TEMP_DATA     = 0xFA;
var REGISTER_HUMIDITY_DATA = 0xFD;


/**
 * Constructor
 * @see Device
 */
var BME280 = function BME280(server, i2cBus) {
	Device.call(this, null, true, server);
	this.i2cBus = i2cBus
	this.i2cAddress = null
	this.calibrations = null
	this.initOk = false
};

util.inherits(BME280, Device);


/**
 * @see Device.init
 */
BME280.prototype.init = function() {
	LOG.info(this, "Init")
	
	if (this.credentials.address) {
		this.i2cAddress = this.credentials.address
		
		try {
			this.i2cBus.writeByteSync(this.i2cAddress, REGISTER_CHIPID, 0)
		} catch (ex) {
			LOG.error(this, "Cannot write chip register !", this.i2cAddress, ex)
			return
		}
		
		var chipId
		
		try {
			chipId = this.i2cBus.readByteSync(this.i2cAddress, REGISTER_CHIPID)
		} catch (ex) {
			LOG.error("Cannot get chip ID !", this.i2cAddress, ex)
			return
		}
		
		
		if (chipId != CHIP_ID_BME280) {
			LOG.error(this, "Chip ID not recognized !", chipId)
			return
		}
		
		if (! this.loadCalibration()) {
			LOG.error(this, "Cannot get calibration !")
			return
		}
		
		try {
			// Humidity 16x oversampling
			this.i2cBus.writeByteSync(this.i2cAddress, REGISTER_CONTROL_HUM, 0x05)
			// Temperture/pressure 16x oversampling, normal mode
			this.i2cBus.writeByteSync(this.i2cAddress, REGISTER_CONTROL, 0xB7)
		} catch (ex) {
			LOG.error(this, "Cannot configure sampling !", ex)
			return
		}
		
		this.initOk = true
	}
};


/**
 * @see Device.free
 */
BME280.prototype.free = function() {
	LOG.info(this, "Free")
};


/**
 * @see Device.read
 */
BME280.prototype.read = function() {	
	if (! this.initOk) {
		LOG.error(this, "Cannot read : init cot completed !")
		return
	}
	
	var buffer = new Buffer(8)
	
	try {
		this.i2cBus.readI2cBlockSync(this.i2cAddress, REGISTER_PRESSURE_DATA, 8, buffer)
	} catch (ex) {
		LOG.error(this, "Cannot read values register !", ex)
		return
	}
	
	// Temperature (temperature first since we need t_fine for pressure and humidity)
    var adc_T = this.uint20(buffer[3], buffer[4], buffer[5]);
    var tvar1 = ((((adc_T >> 3) - (this.calibrations.dig_T1 << 1))) * this.calibrations.dig_T2) >> 11;
    var tvar2  = (((((adc_T >> 4) - this.calibrations.dig_T1) * ((adc_T >> 4) - this.calibrations.dig_T1)) >> 12) * this.calibrations.dig_T3) >> 14;
    var t_fine = tvar1 + tvar2;

    var temperature_C = ((t_fine * 5 + 128) >> 8) / 100;
    sendTemp(temperature_C)

    // Pressure
    var adc_P = this.uint20(buffer[0], buffer[1], buffer[2]);
    var pvar1 = t_fine / 2 - 64000;
    var pvar2 = pvar1 * pvar1 * this.calibrations.dig_P6 / 32768;
    pvar2 = pvar2 + pvar1 * this.calibrations.dig_P5 * 2;
    pvar2 = pvar2 / 4 + this.calibrations.dig_P4 * 65536;
    pvar1 = (this.calibrations.dig_P3 * pvar1 * pvar1 / 524288 + this.calibrations.dig_P2 * pvar1) / 524288;
    pvar1 = (1 + pvar1 / 32768) * this.calibrations.dig_P1;

    var pressure_hPa = 0;

    if (pvar1 !== 0) {
      var p = 1048576 - adc_P;
      p = ((p - pvar2 / 4096) * 6250) / pvar1;
      pvar1 = this.calibrations.dig_P9 * p * p / 2147483648;
      pvar2 = p * this.calibrations.dig_P8 / 32768;
      p = p + (pvar1 + pvar2 + this.calibrations.dig_P7) / 16;

      pressure_hPa = p / 100;
      sendPres(pressure_hPa)
    }

    // Humidity (available on the BME280, will be zero on the BMP280 since it has no humidity sensor)
    var adc_H = this.uint16(buffer[6], buffer[7]);

    var h = t_fine - 76800;
    h = (adc_H - (this.calibrations.dig_H4 * 64 + this.calibrations.dig_H5 / 16384 * h)) *
        (this.calibrations.dig_H2 / 65536 * (1 + this.calibrations.dig_H6 / 67108864 * h * (1 + this.calibrations.dig_H3 / 67108864 * h)));
    h = h * (1 - this.calibrations.dig_H1 * h / 524288);

    var humidity = (h > 100) ? 100 : (h < 0 ? 0 : h);
    sendHumd(humidity)
};


BME280.prototype.sendTemp = function(value) {
	var bme = new BME280(this.server)
    bme.implClass = SMARTHOME_CLASS_TEMP
    bme.mac = "bme280_1_temp"
    bme.value = value
    
    LOG.info(this, "Read temperature ", value)
    this.server.emit('value', bme);
};


BME280.prototype.sendHumd = function(value) {
	var bme = new BME280(this.server)
    bme.implClass = SMARTHOME_CLASS_HUMD
    bme.mac = "bme280_1_humd"
    bme.value = value
    
    LOG.info(this, "Read humidite ", value)
    this.server.emit('value', bme);
};


BME280.prototype.sendPres = function(value) {
	var bme = new BME280(this.server)
    bme.implClass = SMARTHOME_CLASS_PRES
    bme.mac = "bme280_1_pres"
    bme.value = value
    
    LOG.info(this, "Read pression ", value)
    this.server.emit('value', bme);
};


/**
 * @see Device.canWrite
 */
BME280.prototype.canWrite = function(device) {
	return false;
};


/**
 * @see Device.startInclusion
 */
BME280.prototype.startInclusion = function() {
	
};


/**
 * @see Device.startExclusion
 */
BME280.prototype.startExclusion = function() {
	
};


/**
 * @see config
 */
BME280.prototype.config = function(deviceMac, metadataName, metadataValue) {
	
};


/**
 * @see resetConfig
 */
BME280.prototype.resetConfig = function() {
	
};


/**
 * @see resetConfig
 */
BME280.prototype.loadCalibration = function() {
	var buffer = new Buffer(24)
	
	this.i2cBus.readI2cBlockSync(this.i2cAddress, REGISTER_DIG_T1, 24, buffer)
	
	var h1 = this.i2cBus.readByteSync(this.i2cAddress, REGISTER_DIG_H1);
    var h2 = this.i2cBus.readWordSync(this.i2cAddress, REGISTER_DIG_H2);
    var h3 = this.i2cBus.readByteSync(this.i2cAddress, REGISTER_DIG_H3);
    var h4 = this.i2cBus.readByteSync(this.i2cAddress, REGISTER_DIG_H4);
    var h5 = this.i2cBus.readByteSync(this.i2cAddress, REGISTER_DIG_H5);
    var h5_1 = this.i2cBus.readByteSync(this.i2cAddress, REGISTER_DIG_H5 + 1);
    var h6 = this.i2cBus.readByteSync(this.i2cAddress, REGISTER_DIG_H6);

    this.calibrations = {
        dig_T1: this.uint16(buffer[1], buffer[0]),
        dig_T2: this.int16(buffer[3], buffer[2]),
        dig_T3: this.int16(buffer[5], buffer[4]),

        dig_P1: this.uint16(buffer[7], buffer[6]),
        dig_P2: this.int16(buffer[9], buffer[8]),
        dig_P3: this.int16(buffer[11], buffer[10]),
        dig_P4: this.int16(buffer[13], buffer[12]),
        dig_P5: this.int16(buffer[15], buffer[14]),
        dig_P6: this.int16(buffer[17], buffer[16]),
        dig_P7: this.int16(buffer[19], buffer[18]),
        dig_P8: this.int16(buffer[21], buffer[20]),
        dig_P9: this.int16(buffer[23], buffer[22]),

        dig_H1: h1,
        dig_H2: h2,
        dig_H3: h3,
        dig_H4: (h4 << 4) | (h5 & 0xF),
        dig_H5: (h5_1 << 4) | (h5 >> 4),
        dig_H6: h6
    };
	
	return true
};


BME280.prototype.uint20 = function(msb, lsb, xlsb) {
	return ((msb << 8 | lsb) << 8 | xlsb) >> 4;
}


BME280.prototype.uint16 = function(msb, lsb) {
	return msb << 8 | lsb;
}


BME280.prototype.int16 = function(msb, lsb) {
	var val = this.uint16(msb, lsb);
    return val > 32767 ? (val - 65536) : val;
}



module.exports.BME280 = BME280;
