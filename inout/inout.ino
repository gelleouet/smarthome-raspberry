const int DEBUTPIN = 2;
const int FINPIN = 13;
const int MAXBUFFER = 16;
char buffer[MAXBUFFER];
int idxBuffer = 0;


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

  resetBuffer();
  
  Serial.begin(9600); 

  // on previent l'agent du nombre de pins configurés
  for (int idx=DEBUTPIN; idx<=FINPIN; idx++) {
    Serial.print("{\"mac\": \"arduino");
    Serial.print(idx);
    Serial.println("\", \"value\": 0}");
  }
}

void loop() {
  if (Serial.available()) {
    if (readBuffer()) {
      parseBuffer();
      resetBuffer();
    }
  }
}


void resetBuffer() {
  memset(buffer, 0, MAXBUFFER);
  idxBuffer = 0;
}


boolean readBuffer() {
   buffer[idxBuffer] = (char) Serial.read();

   if (buffer[idxBuffer] == '\n' || buffer[idxBuffer] == '\r') {
     buffer[idxBuffer] = '\0';
     return true;   
   } else {
     if (idxBuffer < (MAXBUFFER-2)) {
        idxBuffer++;      
     } else {
        resetBuffer();
     }
     
     return false;
   }
}


void parseBuffer() {
  char *split = strtok(buffer, ":");
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

