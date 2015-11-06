## smarthome-raspberry

Un agent en Node.JS pour se connecter à l'application domotique [smarthome](https://www.jdevops.com/smarthome).  

Prend en charge :
* Le bus 1-Wire : permet de connecter des sondes  de température 1-Wire (Dallas)
* GPIO : permet de connecter des périphériques en entrée (contact sec, bouton, etc) ou sortie (relai, etc.) sur le port GPIO
* Téléinfo EDF : permet de brancher son compteur EDF via le téléinfo pour gérer sa consommation électrique
* Arduino : sur un port série permet de compléter le port GPIO pour avoir plus d'entrées/sorties numériques. L'arduino gère mieux les interruptions temps réel et permet aussi de la brancher sur une carte relai (ex : [sainsmart](http://www.sainsmart.com/arduino/arduino-components.html))
* ZWave : permet via un dongle USB de connecter des périphériques ZWave avec la librairie [OpenZwave](http://www.openzwave.com/)

### Fonctionnement

L'agent se connecte après une phase d'authentification à un websocket sur l'application [smarthome](https://www.jdevops.com/smarthome). Ce websocket permet de recevoir ou d'envoyer en temps réel les infos au serveur domotique.
