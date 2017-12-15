#include <SPI.h>
#include <Wire.h>
#include <Adafruit_BME280.h>


// pointer sur les méthodes interrupt
typedef void (*onInterrupt)();

struct CompteurMaxSecData {
  int value;
  int max;
  unsigned long maxTime;
  unsigned long lastValueTime;
  unsigned long lastDebounceTime; 
};

struct CompteurData {
  int value; 
  unsigned long lastDebounceTime; 
};

const int INPIN[] = {4,5,6,7,8,9,10,11,12,22,23,24,25,26,27,28,29};
const int INLENGTH = sizeof(INPIN) / sizeof(int);
int* _inValues; 

const int OUTPIN[] = {13,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47};
const int OUTLENGTH = sizeof(OUTPIN) / sizeof(int);

const unsigned long DEBOUNCE = 5;
const unsigned long INTERVALLE_COMPTEUR_SECONDE = 10000;
const unsigned long SEND_TIMER = 60000 * 5; // toutes les 5 minutes
unsigned long _lastSendTimer = 0;

const int COMPTEUR[] = {};
const int CPTLENGTH = sizeof(COMPTEUR) / sizeof(int);
volatile CompteurData* _compteurValues;

const int COMPTEURSEC[] = {2};
const int CPTSECLENGTH = sizeof(COMPTEURSEC) / sizeof(int);
volatile CompteurMaxSecData* _compteurSecValues;

const int MAXBUFFER = 32;
char _buffer[MAXBUFFER];
volatile int _idxBuffer = 0;
volatile boolean _bufferFilled = true;

Adafruit_BME280 _bme280; 


/**
 * Les pointeurs vers les méthodes interrupt
 * pour passer des paramètres aux méthodes compteur
 */
void compteurMaxParSeconde0() {
  compteurMaxParSeconde(0);
}

void compteurMaxParSeconde1() {
  compteurMaxParSeconde(1);
}

void compteur0() {
  compteur(0);
}

void compteur1() {
  compteur(1);
}

const onInterrupt COMPTEURISR[] = {compteur0, compteur1};
const onInterrupt COMPTEURSECISR[] = {compteurMaxParSeconde0, compteurMaxParSeconde1};

/**
 * Init programme
 */
void setup() {
  // Creation des buffers de values
  _inValues = (int*) malloc(sizeof(int) * INLENGTH);
  _compteurSecValues = (CompteurMaxSecData*) malloc(sizeof(CompteurMaxSecData) * CPTSECLENGTH);
  _compteurValues = (CompteurData*) malloc(sizeof(CompteurData) * CPTLENGTH);
  
  // les pins en sortie sont configurés avec une résistance pullup
  // (utile pour les cartes relais type sainsmart qui fonctionnent "à l'envers")
  for (int idx=0; idx<OUTLENGTH; idx++) {
    pinMode(OUTPIN[idx], OUTPUT);
    // pas de high pour la 13 car c'est la led et on ne va pas la laisser allumer
    // elle pourra servir de test
    if (OUTPIN[idx] != 13) {
     digitalWrite(OUTPIN[idx], HIGH);
    }
  }
  
  for (int idx=0; idx<INLENGTH; idx++) {
    pinMode(INPIN[idx], INPUT_PULLUP);
    _inValues[idx] = HIGH;
  }

  // les pins interrupt par seconde sont configurés en entrée
  for (int idx=0; idx<CPTSECLENGTH; idx++) {
    pinMode(COMPTEURSEC[idx], INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(COMPTEURSEC[idx]), COMPTEURSECISR[idx], FALLING);
  }

  // les pins interrupt sont configurés en entrée
  for (int idx=0; idx<CPTLENGTH; idx++) {
    pinMode(COMPTEUR[idx], INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(COMPTEUR[idx]), COMPTEURISR[idx], FALLING);
  }

  resetBuffer();
  
  Serial.begin(9600); 

  // on previent l'agent du nombre de pins configurés en sortie
  // pas utile pour les entrées ca va remonter dès qu'une valeur sera détectée
  for (int idx=0; idx<OUTLENGTH; idx++) {
    sendValue(OUTPIN[idx], 0);
  }

  _bme280.begin();
}


/**
 * Envoi la valeur d'un pin vers le controller
 */
void sendValue(int pin, int value) {
   Serial.print("{\"mac\":\"arduino");
   Serial.print(pin);
   Serial.print("\",\"value\":");
   Serial.print(value);
   Serial.println("}");
}


/**
 * Envoi d'une valeur avec une adresse mac paramétrée
 */
void sendValue(char* mac, float value) {
  Serial.print("{\"mac\":\"");
  Serial.print(mac);
  Serial.print("\",\"value\":");
  Serial.print(value);
  Serial.println("}");
}


/**
 * Programme principal
 */
void loop() {
  // lecture des pins IN
  for (int idx=0; idx<INLENGTH; idx++) {
    // 2 lecture avec pause pour gerer les parasites
    int firstRead = digitalRead(INPIN[idx]);    
    delay(DEBOUNCE);
    int secondRead = digitalRead(INPIN[idx]);
  
    if ((firstRead == secondRead) && (firstRead != _inValues[idx])) {
      _inValues[idx] = firstRead;
      // attention les pins IN sont inversés (high -> 0, low -> 1) à cause du pullup
      sendValue(INPIN[idx], _inValues[idx] == HIGH ? 0 : 1);
    }
  }

  // attente info du controller
  if (_bufferFilled) {
    parseBuffer();
    resetBuffer();
  }

  // envoi des valeurs des interrupt toutes les X minutes
  sendCompteurValues();
}


/**
 * Interruption déclenchée dès que le buffer Série
 * contient des données
 */
void serialEvent() {
  while (Serial.available()) {
    if (readBuffer()) {
      _bufferFilled = true;
    }
  }
}


/**
 * Vérifie le timer pour l'envoi de données des compteurs
 * Envoi puis reset des valeurs
 */
void sendCompteurValues() {
  unsigned long timer = millis();
  unsigned long ellapse = timer - _lastSendTimer;

  if (ellapse > SEND_TIMER || _lastSendTimer > timer) {

    for (int idx=0; idx<CPTSECLENGTH; idx++) {
      if (_compteurSecValues[idx].max > 0) {
        // on ramène la valeur sur 1 seconde car la prise de valeur était sur INTERVALLE_COMPTEUR_SECONDE
        sendValue(COMPTEURSEC[idx], (_compteurSecValues[idx].max / (_compteurSecValues[idx].maxTime / 1000)));        
      }      
      _compteurSecValues[idx].max = 0;
    }

    for (int idx=0; idx<CPTLENGTH; idx++) {
      if (_compteurValues[idx].value > 0) {
        sendValue(COMPTEUR[idx], _compteurValues[idx].value);
      }
      _compteurValues[idx].value = 0;
    }

    readBme280();

    _lastSendTimer = timer;
  }
}


/**
 * Réinitialise le buffer Série
 */
void resetBuffer() {
  memset(_buffer, 0, MAXBUFFER);
  _idxBuffer = 0;
  _bufferFilled = false;
}


/**
 * Lecture d'un seul caractère sur le buffer série
 */
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


/**
 * Exécution des commandes recues dans le buffer Série
 */
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

  // les valeurs sont inversées par rapport à la normale
  // sauf pour la led de test
  if (!isInput(pin)) {
    if (valeur == 0) {
      digitalWrite(pin, pin == 13 ? LOW : HIGH);    
    } else if (valeur == 1) {
      digitalWrite(pin, pin == 13 ? HIGH : LOW);     
    }
  }
}


/**
 * Interrupt pour les compteurs max par seconde
 * Le compteur est réinitialisé toutes les X secondes
 * et seule la valeur max est conservée
 */
void compteurMaxParSeconde(int idx) {
  unsigned long timer = millis();

  // gestion du debounce
  unsigned long ellapse = timer - _compteurSecValues[idx].lastDebounceTime;

  if (ellapse < DEBOUNCE) {
    return;
  }

  ellapse = timer - _compteurSecValues[idx].lastValueTime;

  // reset toutes les X secondes et sauvegarde du max
  if (ellapse > INTERVALLE_COMPTEUR_SECONDE) {
      if (_compteurSecValues[idx].value > _compteurSecValues[idx].max) {
         _compteurSecValues[idx].max = _compteurSecValues[idx].value;
         _compteurSecValues[idx].maxTime = ellapse;
      }
    _compteurSecValues[idx].value = 0;
    _compteurSecValues[idx].lastValueTime = timer;
  }
  
  _compteurSecValues[idx].value++;
  _compteurSecValues[idx].lastDebounceTime = timer;
}


/**
 * Interrupt pour les compteurs simples
 * Le compteur est incrémenté à chaque fois
 */
void compteur(int idx) {
  unsigned long timer = millis();

  // gestion du debounce
  unsigned long ellapse = timer - _compteurValues[idx].lastDebounceTime;

  if (ellapse < DEBOUNCE) {
    return;
  }
  
  _compteurValues[idx].value++;
  _compteurValues[idx].lastDebounceTime = timer;
}


/**
 * Pin out ou in
 */
boolean isInput(int pin) {
  // les in sont éclatés dans 3 buffer (avec les interrupt)
  // donc on cherche dans le buffer des out et si trouvé, c'est pas un input
  for (int idx=0; idx<OUTLENGTH; idx++) {
    if (OUTPIN[idx] == pin) {
      return false;
    }
  }
  return true; 
}


void readBme280() {
  sendValue("bme280_1_temp", _bme280.readTemperature());
  sendValue("bme280_1_humd", _bme280.readHumidity() / 100.0F);
  sendValue("bme280_1_pres", _bme280.readPressure());
}

