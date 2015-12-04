// pointer sur les méthodes interrupt
typedef void (*onInterrupt)();

const int INPIN[] = {4,5,6,7,8,9,10,11,12,22,23,24,25,26,27,28,29};
const int INLENGTH = sizeof(INPIN) / sizeof(int);
int* _inValues; 

const int OUTPIN[] = {30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49};
const int OUTLENGTH = sizeof(OUTPIN) / sizeof(int);

const int COMPTEUR[] = {18,19,20,21};
const int CPTLENGTH = sizeof(COMPTEUR) / sizeof(int);
const onInterrupt COMPTEURISR[] = {compteur0, compteur1, compteur2, compteur3};
volatile int* _compteurValues;

const int COMPTEURSEC[] = {2,3};
const int CPTSECLENGTH = sizeof(COMPTEURSEC) / sizeof(int);
const onInterrupt COMPTEURSECISR[] = {compteurMaxParSeconde0, compteurMaxParSeconde1};
volatile int* _compteurSecValues;
volatile int* _compteurSecMaxValues;
volatile unsigned long* _compteurSecLastTime;

const int MAXBUFFER = 16;
const unsigned long SEND_TIMER = 60000 * 5; // toutes les 5 minutes
unsigned long _lastSendTimer = 0;

char _buffer[MAXBUFFER];
int _idxBuffer = 0;


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

void compteur2() {
  compteur(2);
}

void compteur3() {
  compteur(3);
}

void setup() {
  // Creation des buffers de values
  _inValues = (int*) malloc(sizeof(int) * INLENGTH);
  _compteurSecValues = (int*) malloc(sizeof(int) * CPTSECLENGTH);
  _compteurSecMaxValues = (int*) malloc(sizeof(int) * CPTSECLENGTH);
  _compteurSecLastTime = (unsigned long*) malloc(sizeof(unsigned long) * CPTSECLENGTH);
  _compteurValues = (int*) malloc(sizeof(int) * CPTLENGTH);
  
  // les pins en sortie sont configurés avec une résistance pullup
  // (utile pour les cartes relais type sainsmart qui fonctionnent "à l'envers")
  for (int idx=0; idx<OUTLENGTH; idx++) {
    pinMode(OUTPIN[idx], OUTPUT);
    digitalWrite(OUTPIN[idx], HIGH);
  }
  
  for (int idx=0; idx<INLENGTH; idx++) {
    pinMode(INPIN[idx], INPUT_PULLUP);
    _inValues[idx] = HIGH;
  }

  // les pins interrupt par seconde sont configurés en entrée
  for (int idx=0; idx<CPTSECLENGTH; idx++) {
    pinMode(COMPTEURSEC[idx], INPUT_PULLUP);
    _compteurSecValues[idx] = 0;
    _compteurSecMaxValues[idx] = 0;
    _compteurSecLastTime[idx] = 0;
    attachInterrupt(digitalPinToInterrupt(COMPTEURSEC[idx]), COMPTEURSECISR[idx], FALLING);
  }

  // les pins interrupt sont configurés en entrée
  for (int idx=0; idx<CPTLENGTH; idx++) {
    pinMode(COMPTEUR[idx], INPUT_PULLUP);
    _compteurValues[idx] = 0;
    attachInterrupt(digitalPinToInterrupt(COMPTEUR[idx]), COMPTEURISR[idx], FALLING);
  }

  resetBuffer();
  
  Serial.begin(9600); 

  // on previent l'agent du nombre de pins configurés en sortie
  // pas utile pour les entrées ca va remonter dès qu'une valeur sera détectée
  for (int idx=0; idx<OUTLENGTH; idx++) {
    sendValue(OUTPIN[idx], 0);
  }

  Serial.println("LOG Setup Arduino Smarthome Module.");
}


/**
 * Envoi la valeur d'un pin vers le controller
 */
void sendValue(int pin, int value) {
   Serial.print("{\"mac\": \"arduino");
   Serial.print(pin);
   Serial.print("\", \"value\":");
   Serial.print(value);
   Serial.print("\", \"input\":");
   Serial.print(isInput(pin) ? "true" : "false");
   Serial.println("}");
}


/**
 * Programme principam
 */
void loop() {
  // lecture des pins IN
  for (int idx=0; idx<INLENGTH; idx++) {
    // 2 lecture avec pause pour gerer les parasites
    int firstRead = digitalRead(INPIN[idx]);    
    delay(15);
    int secondRead = digitalRead(INPIN[idx]);
  
    if ((firstRead == secondRead) && (firstRead != _inValues[idx])) {
      _inValues[idx] = firstRead;
      sendValue(INPIN[idx], _inValues[idx]);
    }
  }

  // attente info du controller
  if (Serial.available()) {
    if (readBuffer()) {
      parseBuffer();
      resetBuffer();
    }
  }

  // envoi des valeurs des interrupt toutes les X minutes
  sendCompteurValues();
}


/**
 * Vérifie le timer pour l'envoi de données
 */
void sendCompteurValues() {
  unsigned long timer = millis();
  long ellapse = timer - _lastSendTimer;

  if (ellapse >= SEND_TIMER) {
    // envoi puis reset des valeurs
    for (int idx=0; idx<CPTSECLENGTH; idx++) {
      sendValue(COMPTEURSEC[idx], _compteurSecMaxValues[idx]);
      
      _compteurSecValues[idx] = 0;
      _compteurSecMaxValues[idx] = 0;
      _compteurSecLastTime[idx] = 0;
    }

    for (int idx=0; idx<CPTLENGTH; idx++) {
       sendValue(COMPTEUR[idx], _compteurValues[idx]);
      _compteurValues[idx] = 0;
    }

    _lastSendTimer = timer;
  }
}


/**
 * Vide le buffer série
 */
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



/**
 * Interrupt pour les compteurs max par seconde
 * Le compteur est réinitialisé toutes les secondes
 * et seule la valeur max est conservée
 */
void compteurMaxParSeconde(int idx) {
  unsigned long timer = millis();
  long ellapse = timer - _compteurSecLastTime[idx];

  // reset toutes les secondes et sauvegarde du max
  if (ellapse >= 1000) {
    if (_compteurSecValues[idx] > _compteurSecMaxValues[idx]) {
       _compteurSecMaxValues[idx] = _compteurSecValues[idx];
    }
    _compteurSecValues[idx] = 0;
    _compteurSecLastTime[idx] = timer;
  }
  _compteurSecValues[idx]++;
}


/**
 * Interrupt pour les compteurs simples
 * Le compteur est incrémenté à chaque fois
 */
void compteur(int idx) {
  _compteurValues[idx]++;
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

