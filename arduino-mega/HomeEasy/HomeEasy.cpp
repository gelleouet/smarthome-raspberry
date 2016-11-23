/**
 * HomeEasy Library
 *
 * Usage notes : 
 *   By default the library is hooked up to a fixed set of pins (for the benefit of the interrupts) and configured for a standard Arduino.
 *
 *   On a standard Arduino, you should connect the transmitter data to pin 13 and the receiver data to pin 8 
 *   - The transmission pin is configurable, by editing HomeEasyDefines.h - see http://www.arduino.cc/en/Hacking/PinMapping168 to select a port and pin
 *
 *   On an Arduino Mega, you should connect the transmitter data to pin 48 and the receiver data to pin 49
 *   - The receiving pin is configurable, by editing HomeEasyDefines.h - selecting HETIMER4 selects pin 49, and HETIMER5 selects pin 48
 *   - The transmission pin is configurable, by editing HomeEasyDefines.h - see http://arduino.cc/en/uploads/Main/arduino-mega2560-schematic.pdf to select a port and pin
 */
#include "HomeEasyDefines.h"
#include "HomeEasy.h"

// variables used for receiving the messages
unsigned int pulseWidth = 0;
unsigned int latchStage = 0;
bool bbsb2011 = false;
signed int bitCount = 0;
byte bit = 0;
byte prevBit = 0;

// variables for storing the data received
unsigned long sender = 0;
unsigned int recipient = 0;
byte command = 0;
bool group = false;

// variables for sending messages
byte messageType;
unsigned int messageCount;

// result handlers
void (*HomeEasy::simpleProtocolHandler)(unsigned int, unsigned int, bool) = NULL;
void (*HomeEasy::advancedProtocolHandler)(unsigned long, unsigned int, bool, bool) = NULL;
void (*HomeEasy::bbsb2011ProtocolHandler)(unsigned int, unsigned int, bool, bool) = NULL;


/**
 * Constructor
 */
HomeEasy::HomeEasy() {
}

/**
 * Initialise the system.
 * 
 * Enables the receiving of messages.
 */
void HomeEasy::init() {
  // ensure the receiver pin is set for input
  HE_RXDDR &= ~_BV(HE_RXPIN);
  
  // disable PWM (default)
  HE_TCCRA = 0x00;
  
  // set prescaler to 1/8.  HE_TCNT increments every 0.5 micro seconds
  // falling edge used as trigger
  HE_TCCRB = _BV(CS21);
  
  // enable input capture interrupt for HETIMER
  HE_TIMSK = _BV(HE_ICIE);
}

/**
 * Reconfigure the interrupts for sending a message.
 */
void HomeEasy::initSending() {
  // reset counter
  HE_TCNT = 0;

  // ensure the transmitter pin is set for output
  HE_TXDDR |= _BV(HETXPIN);

  // the value that the timer will count up to before firing the interrupt
  HE_OCRA = (pulseWidth * 2);

  // do not toggle OCxA on compare match, do it manually otherwise we get out of sync
  HE_TCCRA = 0;

  // CTC mode: top of HE_OCRA, immediate update of HE_OCRA, TOVx flag set on MAX
  HE_TCCRB |= _BV(HE_WGM2);

  // enable timer interrupt for HETIMER, disable input capture interrupt
  HE_TIMSK = _BV(HE_OCIEA);
}

/**
 * Register a handler for the simple protocol messages.
 */
void HomeEasy::registerSimpleProtocolHandler(void(*handler)(unsigned int, unsigned int, bool)) {
  HomeEasy::simpleProtocolHandler = handler;
}

/**
 * Register a handler for the advanced protocol messages.
 */
void HomeEasy::registerAdvancedProtocolHandler(void(*handler)(unsigned long, unsigned int, bool, bool)) {
  HomeEasy::advancedProtocolHandler = handler;
}

/**
 * Register a handler for the BBSB 2011 protocol messages.
 */
void HomeEasy::registerBBSB2011ProtocolHandler(void(*handler)(unsigned int, unsigned int, bool, bool)) {
  HomeEasy::bbsb2011ProtocolHandler = handler;
}

/**
 * The input interrupt handler.
 *
 * This is where the message is received and decoded.
 */
ISR(HE_TIMER_CAPT_vect)
{
	// reset counter
	HE_TCNT = 0;
	
	// get value of input compare register, divide by two to get microseconds
	pulseWidth = (HE_ICR / 2);
	
	if(bit_is_clear(HE_TCCRB, HE_ICES))
	{	// falling edge was detected, HIGH pulse end
		
		if(latchStage == 1 && pulseWidth > 200 && pulseWidth < 350)
		{	// advanced protocol latch
			
			latchStage = 2;
		}
		else if(latchStage == 3 && (pulseWidth < 150 || pulseWidth > 500))
		{	// advanced protocol data out of timing range
			
			latchStage = 0;
			bitCount = 0;
			
			sender = 0;
			recipient = 0;
		}
		else if(latchStage == 1 && bbsb2011)
		{ // bbsb2011 protocol data
			
			bitCount++;
			
			if (pulseWidth > 280 && pulseWidth < 340)
			{
				bit = 0;
			}
			else if(pulseWidth > 850 && pulseWidth < 950)
			{
				bit = 1;
			}
			else
			{ // start over if the pulse was out of range
			
				latchStage = 0;
				bitCount = 0;
				bbsb2011 = false;
				
				sender = 0;
				recipient = 0;
				command = 0;
			}
			
			if(bitCount < 17)
			{
				sender <<= 1;
				sender |= bit;
			}
			else if(bitCount < 22)
			{
				command <<= 1;
				command |= bit;
			}
			else if(bitCount < 25)
			{
				recipient <<= 1;
				recipient |= bit;
			}

			if(bitCount == 25)
			{	// message is complete
			
				if(command == 0x14 || command == 0x15)
				{
					if(HomeEasy::bbsb2011ProtocolHandler != NULL)
					{
						if(recipient > 1)
						{
							if(recipient & 0x01)
							{ recipient = 4 - (recipient >> 1);
							}
							else
							{ recipient = 7 - (recipient >> 1);
							}
						}
						else
						{ recipient = 0;
						}
						HomeEasy::bbsb2011ProtocolHandler((int)sender, recipient, (command == 0x15), (recipient == 1));
					}
				}
				
				latchStage = 0;
				bitCount = 0;
				bbsb2011 = false;
				
				sender = 0;
				recipient = 0;
				command = 0;
			}
		}
		else if(latchStage == 1)
		{	// simple protocol data
			
			bitCount++;
			
			if(pulseWidth > 280 && pulseWidth < 430) // Relaxed from 320<x<430
			{
				bit = 0;
			}
			else if(pulseWidth > 975 && pulseWidth < 1150 && bitCount % 2 == 0) // Relaxed from 1030<x<1150
			{
				bit = 0x08;
			}
			else
			{	// start over if the low pulse was out of range
				
				latchStage = 0;
				bitCount = 0;
				
				sender = 0;
				recipient = 0;
			}
			
			if(bitCount % 2 == 0)
			{
				if(bitCount < 9)
				{
					sender >>= 1;
					sender |= bit;
				}
				else if(bitCount < 17)
				{
					recipient >>= 1;
					recipient |= bit;
				}
				else
				{
					command >>= 1;
					command |= bit;
				}
			}
			
			if(bitCount == 25)
			{	// message is complete
				
				if(command == 14 || command == 6)
				{
					if(HomeEasy::simpleProtocolHandler != NULL)
					{	HomeEasy::simpleProtocolHandler((int)sender, recipient, (command == 14));
					}
				}
				
				latchStage = 0;
				bitCount = 0;
				
				sender = 0;
				recipient = 0;
			}
		}
	}
	else
	{	// raising edge was detected, LOW pulse end
		
		if(latchStage == 0 && pulseWidth > 9480 && pulseWidth < 11500)
		{	// pause between messages
		
			latchStage = 1;
		}
		else if(latchStage == 0 && pulseWidth > 8500 && pulseWidth < 9480)
		{ // pause between bbsb2011 messages
			latchStage = 1;
			bbsb2011 = true;
		}
		else if(latchStage == 2 && pulseWidth > 2350 && pulseWidth < 2750)
		{	// advanced protocol latch
			
			latchStage = 3;
			sender = 0;
		}
		else if(latchStage == 3)
		{	// advanced protocol data
			
			if(pulseWidth > 200 && pulseWidth < 365)
			{
				bit = 0;
			}
			else if(pulseWidth > 1000 && pulseWidth < 1360)
			{
				bit = 1;
			}
			else
			{	// start over if the low pulse was out of range
				latchStage = 0;
				bitCount = 0;
				
				recipient = 0;
			}
			
			if(bitCount % 2 == 1)
			{
				if((prevBit ^ bit) == 0)
				{	// must be either 01 or 10, cannot be 00 or 11
					
					latchStage = 0;
					bitCount = -1;
				}
				else if(bitCount < 53)
				{	// first 26 data bits
					
					sender <<= 1;
					sender |= prevBit;
				}
				else if(bitCount == 53)
				{	// 26th data bit
					
					group = prevBit;
				}
				else if(bitCount == 55)
				{	// 27th data bit
					
					command = prevBit;
				}
				else
				{	// last 4 data bits
					
					recipient <<= 1;
					recipient |= prevBit;
				}
			}
			
			prevBit = bit;
			bitCount++;
			
			if(bitCount == 64)
			{	// message is complete
				
				if(HomeEasy::advancedProtocolHandler != NULL)
				{	HomeEasy::advancedProtocolHandler(sender, recipient, (bool)command, group);
				}
				
				sender = 0;
				recipient = 0;
				
				latchStage = 0;
				bitCount = 0;
			}
		}
	}
	
	// toggle bit value to trigger on the other edge
	HE_TCCRB ^= _BV(HE_ICES);
}

/**
 *
 */
void HomeEasy::sendSimpleProtocolMessage(unsigned int s, unsigned int r, bool c)
{
	// disable all interrupts
	HE_TIMSK = 0;
	
	// reset variables
	messageCount = 0;
	latchStage = 0;
	bitCount = 0;
	bit = 0;
	prevBit = 0;
	pulseWidth = 10000;
	
	// set data to transmit
	sender = s;
	recipient = r;
	command = (c ? 14 : 6);
	
	// specify encoding
	messageType = MESSAGE_TYPE_SIMPLE;
	
	// start the timer interrupt
	initSending();
}

/**
 *
 */
void HomeEasy::sendAdvancedProtocolMessage(unsigned long s, unsigned int r, bool c, bool g)
{
	// disable all interrupts
	HE_TIMSK = 0;
	
	// reset variables
	messageCount = 0;
	latchStage = 0;
	bitCount = 0;
	bit = 0;
	prevBit = 0;
	pulseWidth = 10000;
	
	// set data to transmit
	sender = s;
	recipient = r;
	command = c;
	group = g;
	
	// specify encoding
	messageType = MESSAGE_TYPE_ADVANCED;
	
	// start the timer interrupt
	initSending();
}

/**
 *
 */
void HomeEasy::sendBBSB2011ProtocolMessage(unsigned int s, unsigned int r, bool c, bool g) {
  // disable all interrupts
  HE_TIMSK = 0;

  // reset variables
  messageCount = 0;
  latchStage = 0;
  bitCount = 0;
  bit = 0;
  prevBit = 0;
  pulseWidth = 10000;

  // set data to transmit
  sender = s;
  if (g) {
    recipient = 1;
  } else if (r & 0x4) {
    recipient = 14 - (2 * r);
  } else {
    recipient = 9 - (2 * r);
  }
  command = c;

  // specify encoding
  messageType = MESSAGE_TYPE_BBSB2011;

  // start the timer interrupt
  initSending();
}

/**
 * The timer interrupt handler.
 * 
 * This is where the message is transmitted.
 * 
 * The timer interrupt is used to wait for the required length of time.  Each call of this
 * function toggles the output and determines the length of the time until the function is
 * called again.
 * 
 * Once the message has been transmitted this class will switch back to receiving.
 */
ISR(HE_TIMER_COMPA_vect)
{
	if(messageType == MESSAGE_TYPE_SIMPLE)
	{
		if(!prevBit && bitCount != 25)
		{
			HE_TXPORT |= _BV(HETXPIN);
		}
		else
		{
			HE_TXPORT &= ~_BV(HETXPIN);
		}
		
		if(bitCount % 2 == 0)
		{	// every other bit is a zero
			bit = 0;
		}
		else if(bitCount < 8)
		{	// sender
			bit = ((sender & _BV((bitCount - 1) / 2)) != 0);
		}
		else if(bitCount < 16)
		{	// recipient
			bit = ((recipient & _BV((bitCount - 9) / 2)) != 0);
		}
		else if(bitCount < 24)
		{	// command
			bit = ((command & _BV((bitCount - 17) / 2)) != 0);
		}
		
		if(bitCount == 25)
		{	// message finished
			
			bitCount = 0;
			messageCount++;
			
			pulseWidth = 10000;
			
			if(messageCount == TRANSMITTER_MESSAGE_COUNT)
			{	// go back to receiving
				
				messageCount = 0;
				
				HE_TCCRA = 0x00;
				HE_TCCRB = 0x02;
				HE_TIMSK = _BV(HE_ICIE);
				
				return;
			}
		}
		else
		{
			if(prevBit && bit || !prevBit && !bit)
			{
				pulseWidth = 375;
			}
			else
			{
				pulseWidth = 1125;
			}
			
			if(prevBit)
			{
				bitCount++;
			}
			
			prevBit = !prevBit;
		}
	}
	else if(messageType == MESSAGE_TYPE_ADVANCED)
	{
		if(!prevBit)
		{
			HE_TXPORT |= _BV(HETXPIN);
		}
		else
		{
			HE_TXPORT &= ~_BV(HETXPIN);
		}
		
		if(!prevBit)
		{
			if(bitCount % 2 == 1 || latchStage == 0)
			{	// every other bit is inverted
				bit = !bit;
			}
			else if(bitCount < 52)
			{	// sender
				bit = (((sender << (bitCount / 2)) & 0x02000000) != 0);
			}
			else if(bitCount < 54)
			{	// group
				bit = group;
			}
			else if(bitCount < 56)
			{	// command
				bit = command;
			}
			else if(bitCount < 64)
			{	// recipient
				bit = ((recipient & _BV(31 - (bitCount / 2))) != 0);
			}
		}
		else
		{
			if(latchStage == 1)
			{
				bitCount++;
			}
		}
		
		if(!prevBit)
		{
			pulseWidth = 235;
		}
		else if(latchStage == 0)
		{
			pulseWidth = 2650;
			
			latchStage = 1;
		}
		else if(bitCount > 64)
		{	// message finished
			
			messageCount++;
			
			pulseWidth = 10000;
			latchStage = 0;
			bitCount = 0;
		}
		else if(bit)
		{
			pulseWidth = 1180;
		}
		else
		{
			pulseWidth = 275;
		}
		
		prevBit = !prevBit;

		if(messageCount == TRANSMITTER_MESSAGE_COUNT)
		{	// go back to receiving
			
			messageCount = 0;
			
			HE_TCCRA = 0x00;
			HE_TCCRB = 0x02;
			HE_TIMSK = _BV(HE_ICIE);
			
			return;
		}
	}
	else if(messageType == MESSAGE_TYPE_BBSB2011)
	{
		if(!prevBit && bitCount != 25)
		{
			HE_TXPORT |= _BV(HETXPIN);
		}
		else
		{
			HE_TXPORT &= ~_BV(HETXPIN);
		}
		
		if(bitCount < 16)
		{	// sender
			bit = (((sender << bitCount) & 0x8000) != 0);
		}
		else if(bitCount < 20)
		{ // 1010
			bit = ((0x5 & _BV(bitCount - 16)) != 0);
		}
		else if(bitCount < 21)
		{	// command
			bit = command;
		}
		else if(bitCount < 24)
		{	// recipient
			bit = (((recipient << (bitCount - 21)) & 0x4) != 0);
		}
		else if(bitCount < 25)
		{ // 0
			bit = 0;
		}
		
		if(bitCount == 25)
		{	// message finished
			bitCount = 0;
			messageCount++;
			
			pulseWidth = 10000;
			
			if(messageCount == TRANSMITTER_MESSAGE_COUNT)
			{	// go back to receiving
				
				messageCount = 0;
				
				HE_TCCRA = 0x00;
				HE_TCCRB = 0x02;
				HE_TIMSK = _BV(HE_ICIE);
				
				return;
			}
		}
		else
		{
			if(prevBit && bit || !prevBit && !bit)
			{
				pulseWidth = 300;
			}
			else
			{
				pulseWidth = 900;
			}
			
			if(prevBit)
			{
				bitCount++;
			}
			
			prevBit = !prevBit;
		}
	}
	
	// set the next delay
	HE_OCRA = (pulseWidth * 2);
}
