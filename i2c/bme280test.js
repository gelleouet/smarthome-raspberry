var I2C = require('../I2C').I2C;
var deviceServer = require('../DeviceServer').newInstance();

// gestionnaire fin application
process.on('SIGINT', exit);
process.on('SIGTERM', exit);


var i2cDriver = new I2C(deviceServer)
i2cDriver.credentials = {
	i2c: {
		bus: 1,
		bme280: {
			address: 119
		}
	}
}
i2cDriver.init()


function exit() {
	i2cDriver.free();
	process.exit();
}
