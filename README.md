## smarthome-raspberry

Un agent en Node.JS pour se connecter à l'application domotique [smarthome](https://www.jdevops.com/smarthome).  

Prend en charge :
* Le bus 1-Wire : permet de connecter des sondes  de température 1-Wire (Dallas)
* GPIO : permet de connecter des périphériques en entrée (contact sec, bouton, etc) ou sortie (relai, etc.) sur le port GPIO
* Téléinfo EDF : permet de brancher son compteur EDF via le téléinfo pour gérer sa consommation électrique

### Fonctionnement

L'agent se connecte après une phase d'authentification à un websocket sur l'application [smarthome](https://www.jdevops.com/smarthome). Ce websocket permet de recevoir ou d'envoyer en temps réel les infos au serveur domotique.
