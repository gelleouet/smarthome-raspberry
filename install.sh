#!/bin/bash

# Version Raspbian Stretch (04-2018)


# Dossier application user
cd /opt


# Installation paquets Linux
apt-get install git
apt-get install i2c-tools
apt-get install nodejs
apt-get install npm
apt-get install libudev-dev
apt-get install build-essential
apt-get install libssl-dev
apt-get install monit
apt-get install kpartx
# reste compatible avec l'ancienne commande
ln -s /usr/bin/nodejs /usr/sbin/node


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
npm install serialport
npm install pi-gpio
npm install node-gyp
npm install openzwave-shared
npm install pty
npm install lokijs
npm install i2c-bus


# Configuration Smarthome
cd /opt/smarthome
chmod +x config.sh
chmod +x upgrade.sh
cp smarthome /etc/init.d/
chmod +x /etc/init.d/smarthome
cp conf/monit/smarthome /etc/monit/conf.d/
cp conf/logrotate/smarthome /etc/logrotate.d/
