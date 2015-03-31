#!/bin/bash
cd /opt


wget http://nodejs.org/dist/v0.10.9/node-v0.10.9-linux-arm-pi.tar.gz
tar -xzvf node-v0.10.9-linux-arm-pi.tar.gz
mv node-v0.10.9-linux-arm-pi node-v0.10.9
sudo ln -s /opt/node-v0.10.9/bin/* /usr/local/sbin/
rm node-v0.10.9-linux-arm-pi.tar.gz
npm install epoll
npm install onoff
npm install ws
npm install node-uuid
#npm install request@2.45.0
npm install request
#npm install ssl-root-cas


cd /opt/smarthome
touch smarthome.credentials
echo "{ \"username\" : \"\",
  \"applicationKey\" : \"\",
  \"applicationHost" : \"https://www.jdevops.com/smarthome\",
  \"agentModel\" : \"Raspberry B+\",
  \"mac\": \"\"
}" > smarthome.credentials

sudo chmod +x smarthome
sudo cp smarthome /etc/init.d/
sudo update-rc.d smarthome defaults


# Version plus à jour compilée ARM
wget http://node-arm.herokuapp.com/node_latest_armhf.deb
sudo dpkg -i node_latest_armhf.deb