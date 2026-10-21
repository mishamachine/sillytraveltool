// Demo-mode response for generate-phrases: a short Spanish phrase book in the real shape
// ({ [category]: [{ english, native, romanized?, context? }] }).
const p = (english, native, context) => ({ english, native, context })

const ES = {
  greetings: [p('Hello', 'Hola'), p('Good morning', 'Buenos días'), p('Thank you very much', 'Muchas gracias'), p('Excuse me', 'Perdone', 'To get attention politely')],
  food: [p("I'm allergic to nuts", 'Soy alérgico a los frutos secos'), p('The bill, please', 'La cuenta, por favor'), p('A table for two', 'Una mesa para dos'), p('Is it spicy?', '¿Pica?')],
  transport: [p('Where is the train station?', '¿Dónde está la estación de tren?'), p('A ticket to Sevilla', 'Un billete a Sevilla'), p('Which platform?', '¿Qué andén?')],
  hotel: [p('I have a reservation', 'Tengo una reserva'), p('What time is check-out?', '¿A qué hora es la salida?'), p('Can I leave my bags?', '¿Puedo dejar mis maletas?')],
  shopping: [p('How much is it?', '¿Cuánto cuesta?'), p('Can I pay by card?', '¿Puedo pagar con tarjeta?'), p("I'm just looking", 'Solo estoy mirando')],
  health: [p('I need a doctor', 'Necesito un médico'), p('Where is the pharmacy?', '¿Dónde está la farmacia?'), p('Call an ambulance', 'Llame a una ambulancia')],
  social: [p('Nice to meet you', 'Encantado'), p('Do you speak English?', '¿Habla inglés?'), p('Cheers!', '¡Salud!')],
  goose_specials: [p('Where do locals eat?', '¿Dónde comen los locales?', 'Best question in any city'), p('One more tapa, please', 'Otra tapa, por favor')],
}

export default function phrasesFixture() {
  return ES
}
