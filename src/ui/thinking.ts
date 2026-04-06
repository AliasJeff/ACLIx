const THINKING_WORDS = [
  'beboppin',
  'unfurling',
  'boondoggling',
  'undulating',
  'sauteing',
  'cascading',
  'befuddling',
  'garnishing',
  'philosophising',
  'scurrying',
  'topsy-turvying',
  'levitating',
  'noodling',
  'moseying',
  'pondering',
  'discombobulating',
  'twisting',
  'wibbling',
  'whirring',
  'sock-hopping',
  'julienning',
  'dilly-dallying',
  'flummoxing',
  'hullaballooing',
] as const;

export function getRandomThinkingLabel(): string {
  const index = Math.floor(Math.random() * THINKING_WORDS.length);
  const label = THINKING_WORDS[index] ?? 'thinking';
  return `${label.charAt(0).toUpperCase() + label.slice(1)}...`;
}
