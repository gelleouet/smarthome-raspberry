var i2c = require('./I2C').I2C();
var deviceServer = require('./DeviceServer').newInstance();

// gestionnaire fin application
process.on('SIGINT', exit);
process.on('SIGTERM', exit);


deviceServer.onMessage = onDeviceMessage;
deviceServer.credentials = {
	i2c: {
		bus: 1,
		bme280: {
			address: 119
		}
	}
}
deviceServer.listen();


function onDeviceMessage(message) {
	console.log(message)
}


function exit() {
	deviceServer.close();
	process.exit();
}