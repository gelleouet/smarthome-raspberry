#!/bin/bash


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

cp -f /opt/smarthome/smarthome.credentials.template /opt/smarthome/smarthome.credentials
sed -i -e "s/insert_here_username/$username/g" /opt/smarthome/smarthome.credentials
sed -i -e "s/insert_here_application_id/$applicationId/g" /opt/smarthome/smarthome.credentials
sed -i -e "s/insert_here_model/$model/g" /opt/smarthome/smarthome.credentials

