#!/bin/bash

# Version Raspbian >= 3.6.18
# Pour mettre à jour : apt-get upgrade && apt-get dist-upgrade


# Dossier application user
cd /opt


# Installation paquets Linux
curl -sLS https://apt.adafruit.com/add | sudo bash
apt-get install node
apt-get install libudev-dev
apt-get install build-essential
apt-get install libssl-dev
apt-get install monit
apt-get install nginx


# Installation OpenZWave
cd /opt
git clone https://github.com/OpenZWave/open-zwave.git
cd open-zwave
make
make install


# Installation gpio-admin
cd /opt
git clone https://github.com/quick2wire/quick2wire-gpio-admin.git
make install


# Installation des modules NodeJS
cd /opt
npm install epoll
npm install onoff
npm install ws
npm install node-uuid
npm install request
npm install ssl-root-cas
npm install serialport@1.4.9
npm install pi-gpio
npm install node-gyp
npm install openzwave-shared
npm install pty


# Configuration Smarthome
cd /opt/smarthome
chmod +x smarthome
chmod +x config.sh
cp smarthome /etc/init.d/
update-rc.d smarthome defaults
cp conf/monit/smarthome /etc/monit/conf.d/
cp conf/logrotate/smarthome /etc/logrotate.d/
cp conf/nginx/smarthome.conf /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default