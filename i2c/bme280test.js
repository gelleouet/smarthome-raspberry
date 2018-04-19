var i2c = require('../I2C').I2C();
var deviceServer = require('./DeviceServer').newInstance();

// gestionnaire fin application
process.on('SIGINT', exit);
process.on('SIGTERM', exit);

var i2cDriver = new I2C(deviceServer, {
	i2c: {
		bus: 1,
		bme280: {
			address: 119
		}
	}
})

i2cDriver.init()

function exit() {
	deviceServer.close();
	i2cDriver.free();
}