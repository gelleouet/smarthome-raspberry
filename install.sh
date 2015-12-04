#!/bin/bash

# Version Raspbian >= 3.6.18
# Pour mettre à jour : apt-get upgrade && apt-get dist-upgrade


# Dossier application user
cd /opt


# Installation NodeJS
curl -sLS https://apt.adafruit.com/add | sudo bash
apt-get install node


# Installation paquets Linux
apt-get install libudev-dev
apt-get install build-essential
apt-get install libssl-dev


# Installation OpenZWave
git clone https://github.com/OpenZWave/open-zwave.git
make
make install


# Installation des modules NodeJS
npm install epoll
npm install onoff
npm install ws
npm install node-uuid
#npm install request@2.45.0
npm install request
npm install ssl-root-cas
npm install serialport@1.4.9
npm install pi-gpio
npm install node-gyp
npm install openzwave-shared


cd /opt/smarthome
touch smarthome.credentials

# get mac from eth0
MAC=`ifconfig eth0 | grep "HWaddr" | awk -F " " '{print $5}'`

echo "{ \"username\" : \"\",
  \"applicationKey\" : \"\",
  \"applicationHost" : \"https://www.jdevops.com/smarthome\",
  \"agentModel\" : \"Raspberry B+\",
  \"mac\": \"$MAC\",
  \"arduinoPort\": \"/dev/ttyUSB11\",
  \"zwavePort\": \"/dev/ttyUSB10\",
  \"teleinfoPort\": \"/dev/ttyAMA0\",
  \"gpioPorts\": [\"gpio17\", \"gpio18\", \"gpio22\", \"gpio23\", \"gpio24\", \"gpio25\", \"gpio27\"]
}" > smarthome.credentials


# Démarrage auto au reboot du PI
sudo chmod +x smarthome
sudo cp smarthome /etc/init.d/
sudo update-rc.d smarthome defaults


