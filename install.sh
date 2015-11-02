#!/bin/bash

# Dossier application user
cd /opt


# Version plus à jour compilée ARM
wget http://node-arm.herokuapp.com/node_latest_armhf.deb
sudo dpkg -i node_latest_armhf.deb


# Installation paquets Linux
apt-get install libudev-dev


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
npm install openzwave


cd /opt/smarthome
touch smarthome.credentials
echo "{ \"username\" : \"\",
  \"applicationKey\" : \"\",
  \"applicationHost" : \"https://www.jdevops.com/smarthome\",
  \"agentModel\" : \"Raspberry B+\",
  \"mac\": \"\"
}" > smarthome.credentials

# Démarrage auto au reboot du PI
sudo chmod +x smarthome
sudo cp smarthome /etc/init.d/
sudo update-rc.d smarthome defaults


