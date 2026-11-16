/**
 * The lines the set designer says the same way every time: the call sheet's steps, read aloud once each to a
 * newcomer, and a few moments that would otherwise be silent. They are recorded ahead of time in both voices
 * (tools/make-voice-lines.mjs writes public/audio/voice/<voice>/<key>.mp3 and a list of what was recorded), so
 * saying one costs nothing and needs no server. What the designer says about a set it built is not here: that is
 * written by the designer and read aloud as it arrives (api/speak.ts).
 */
export const LINES = {
  land: 'Point at a table, or the floor, and pinch. The set lands there.',
  mine: 'That one was mine. Now pinch Talk, on the panel to the left of the set, and tell me yours.',
  say: 'Pinch Talk, on the panel to the left of the set, and tell me the shot.',
  block: 'Move anything by hand, or pinch Talk and tell me what to change. When you like the frame, pinch Snap frame.',
  frame: 'That is your first frame. Pinch Step inside to stand in it.',
  inside: 'You are inside the set. Point at the floor and pinch to walk.',
  cover: 'Planning the coverage.',
  done: 'That is the walkthrough. The set is yours.',
  full: 'The board is full. Pinch Save the board, and it waits for you on the page.',
  back: 'Welcome back. Your set is where you left it.',
  voice: 'I will read you what I build, in this voice.',
  nomic: 'I cannot hear you in here, so here is another shot to try.',
} as const;

export type LineKey = keyof typeof LINES;
