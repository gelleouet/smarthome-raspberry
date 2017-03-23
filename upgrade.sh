#!/bin/bash

SMARTHOME_PATH="/opt/smarthome"
HOME_PATH="/home/pi/smarthome"


# recupere derniere version du programme
cd $SMARTHOME_PATH
git fetch --all
git reset --hard origin/master


# Execute tous le scripts d'upgrade pas encore exécutés
if [ ! -e "$HOME_PATH" ]
then
	mkdir "$HOME_PATH"
fi

cd $SMARTHOME_PATH/upgrades
chmod +x *.sh

for filename in `ls *.sh | sort -V`; do
	# verifie que script pas encore executé
	if [ ! -e "$HOME_PATH/$filename" ]
	then
		echo "Applying upgrade $filename"
		./$filename
		touch "$HOME_PATH/$filename"
	fi
done

