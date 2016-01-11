const int DEBUTPIN = 4;
const int FINPIN = 13;
const int PIN_ISR_COMPTEURSEC = 2;
const int PIN_ISR_COMPTEUR = 3;
const int MAXBUFFER = 16;
const unsigned long SEND_TIMER = 60000 * 5; // toutes les 5 minutes

char _buffer[MAXBUFFER];
int _idxBuffer = 0;
volatile int _compteur = 0;
volatile int _compteurParSeconde = 0;
volatile int _maxCompteurParSeconde = 0;
volatile unsigned long _lastCompteurParSeconde = 0;
unsigned long _lastSendTimer = 0;


void setup() {
  // tous les pins sont configurés en output avec un état HAUT
  // utile pour les cartes relais qui sont inversées
  for (int idx=DEBUTPIN; idx<=FINPIN; idx++) {
    pinMode(idx, OUTPUT);
    // pas de high pour la 13 car c'est la led et on ne va pas la laisser allumer
    // elle pourra servir de test
    if (idx != 13) {
      digitalWrite(idx, HIGH);
    }
  }

  // les pins interrupt sont congigurés en entrée
  pinMode(PIN_ISR_COMPTEURSEC, INPUT_PULLUP);
  pinMode(PIN_ISR_COMPTEUR, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_ISR_COMPTEURSEC), compteurMaxParSeconde, LOW);
  attachInterrupt(digitalPinToInterrupt(PIN_ISR_COMPTEUR), compteur, LOW);

  resetBuffer();
  
  Serial.begin(9600); 

  // on previent l'agent du nombre de pins configurés
  for (int idx=DEBUTPIN; idx<=FINPIN; idx++) {
    sendValue(idx, 0);
  }
}


/**
 * Envoi la valeur d'un pin vers le controller
 */
void sendValue(int pin, int value) {
   Serial.print("{\"mac\": \"arduino");
   Serial.print(pin);
   Serial.print("\", \"value\":");
   Serial.print(value);
   Serial.println("}");
}



/**
 * Vérifie le timer pour l'envoi de données
 * N'envoit les données que si valeur présente
 */
void checkSendTimer() {
  unsigned long timer = millis();
  long ellapse = timer - _lastSendTimer;

  if (ellapse >= SEND_TIMER || _lastSendTimer > timer) {
    if (_maxCompteurParSeconde > 0) {
      sendValue(PIN_ISR_COMPTEURSEC, _maxCompteurParSeconde);
    }

    if (_compteur > 0) {
      sendValue(PIN_ISR_COMPTEUR, _compteur);
    }

    // reset des valeurs
    _compteur = 0;
    _maxCompteurParSeconde = 0;
    _lastSendTimer = timer;
  }
}


void loop() {
  if (Serial.available()) {
    if (readBuffer()) {
      parseBuffer();
      resetBuffer();
    }
  }

  checkSendTimer();
}


void resetBuffer() {
  memset(_buffer, 0, MAXBUFFER);
  _idxBuffer = 0;
}


boolean readBuffer() {
   _buffer[_idxBuffer] = (char) Serial.read();

   if (_buffer[_idxBuffer] == '\n' || _buffer[_idxBuffer] == '\r') {
     _buffer[_idxBuffer] = '\0';
     return true;   
   } else {
     if (_idxBuffer < (MAXBUFFER-2)) {
        _idxBuffer++;      
     } else {
        resetBuffer();
     }
     
     return false;
   }
}


void parseBuffer() {
  char *split = strtok(_buffer, ":");
  int pin = -1;
  int valeur = -1;

  // lecture pin
  if (split != NULL) {
    pin = atoi(split);
    split = strtok(NULL, ":");
  }

  // lecture valeur
  if (split != NULL) {
    valeur = atoi(split);
  }

  if (pin >= DEBUTPIN && pin <= FINPIN && valeur != -1) {
    // les valeurs sont inversées par rapport à la normale
    // sauf pour la led de test
    if (valeur == 0) {
      digitalWrite(pin, pin == 13 ? LOW : HIGH);
      Serial.print("LOG Write HIGH to ");
      Serial.println(pin);      
    } else if (valeur == 1) {
      digitalWrite(pin, pin == 13 ? HIGH : LOW);
      Serial.print("LOG Write LOW to ");
      Serial.println(pin);      
    }
  }
}


/**
 * Interrupt pour les compteurs max par seconde
 * Le compteur est réinitialisé toutes les secondes
 * et seule la valeur max est conservée
 */
void compteurMaxParSeconde() {
  unsigned long timer = millis();
  long ellapse = timer - _lastCompteurParSeconde;

  // reset toutes les secondes et sauvegarde du max
  // test aussi si le timer est revenu à 0 après avoit atteint les 50J
  if (ellapse >= 1000 || _lastCompteurParSeconde > timer) {
    if (_compteurParSeconde > _maxCompteurParSeconde) {
       _maxCompteurParSeconde = _compteurParSeconde;
    }
    _compteurParSeconde = 0;
    _lastCompteurParSeconde = timer;
  }
  _compteurParSeconde++;
}


/**
 * Interrupt pour les compteurs simples
 * Le compteur est incrémenté à chaque fois
 */
void compteur() {
  _compteur++;
}

