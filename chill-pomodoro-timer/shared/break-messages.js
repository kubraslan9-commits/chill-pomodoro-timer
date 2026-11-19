// =============================================================
// BREAK MESSAGES  (PRD requirement F11)
// =============================================================
// The sentences shown on the break screen, one per break.
//
// To edit: change, add or remove lines in the list below. Keep each
// sentence in quotes with a comma after it. A sentence with an
// apostrophe ( ' ) in it needs double quotes: "You're doing fine.",
//
// One sentence is picked at random for every break (short and long
// breaks use the same list), and the same one is never shown twice
// in a row. Changes show from the next break, after reloading the
// extension on chrome://extensions.
// =============================================================

const BREAK_MESSAGES = [
  'Drink a glass of water.',
  'Take a short walk, even just to the kitchen.',
  'Fix your posture and sit back comfortably.',
  'Look out the window and find something green.',
  'Take three slow, deep breaths.',
  'Notice five things you can hear right now.',
  'You did good work. Let it rest.',
  'Let your thoughts wander for a bit.',
  'Open a window and let some fresh air in.',
  'Check what the sky looks like today.',
  'Water a plant, or just say hi to one.',
  'Refill your tea or coffee.',
  'Tidy one small thing on your desk.',
];

// Picks a random sentence from the list, but never `lastMessage`
// (the one shown on the previous break). With only one sentence in
// the list, that one is shown every time.
function pickMessage(messages, lastMessage) {
  const others = messages.filter((message) => message !== lastMessage);
  const choices = others.length > 0 ? others : messages;
  return choices[Math.floor(Math.random() * choices.length)];
}
