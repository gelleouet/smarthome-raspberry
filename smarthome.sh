#!/bin/bash

NODE="node"
PROG="/home/pi/smarthome/smarthome.js"
CREDENTIAL="/home/pi/smarthome/smarthome.credentials"
LOG="/home/pi/smarthome/smarthome.log"

$NODE $PROG --credential $CREDENTIAL >> $LOG 2>&1 &
