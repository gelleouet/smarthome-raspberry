#!/bin/bash

mac=`ifconfig eth0 | grep "ether" | awk -F " " '{print $2}'`

if [ -z "$mac" ]
then
        echo "Error : cannot get mac address. eth0 not found !"
	exit 1
fi

echo -n "Username? "
read username

echo -n "ApplicationId? "
read applicationId

echo -n "Agent model (default: Raspberry Pi)? "
read model


if [ -z "$username" ]
then
        echo "Error : username is required !
	exit 1
fi

if [ -z "$applicationId" ]
then
        echo "Error : applicationId is required !
        exit 1
fi

if [ -z "$model" ]
then
	model="Raspberry Pi"
fi

cp -f /opt/smarthome/smarthome.credentials.template /boot/smarthome
sed -i -e "s/insert_here_username/$username/g" /boot/smarthome
sed -i -e "s/insert_here_application_id/$applicationId/g" /boot/smarthome
sed -i -e "s/insert_here_model/$model/g" /boot/smarthome
sed -i -e "s/insert_here_mac/$mac/g" /boot/smarthome

