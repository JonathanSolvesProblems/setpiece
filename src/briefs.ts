/**
 * Shot briefs: the coverage a director asks for, each one checked from where the
 * pieces actually stand when the frame is taken. A brief passes or it says what
 * is off, in the crew's units. Nothing is scored by opinion: the tests are the
 * textbook definitions of each shot, measured.
 */

export type PieceInFrame = {
  label: string;
  /** Head and feet both inside the frame. */
  whole: boolean;
  /** Eyes inside the frame. */
  eyesIn: boolean;
  /** Eye position in the frame: -1 to 1 across, -1 to 1 up. */
  eyeX: number;
  eyeY: number;
  /** Head height as a fraction of frame height. */
  headSize: number;
  /** Real metres from the lens along the floor. */
  distanceM: number;
  /** Real metres the eyes are above the lens. */
  eyeAboveLensM: number;
};

export type Measure = {
  lensMm: number;
  rig: string;
  /** Real metres of lens above the slate. */
  heightM: number;
  /** Degrees the camera looks above level. */
  tiltDeg: number;
  actors: PieceInFrame[];
  /** The creature is on the set at all; a brief only asks for it when it is. */
  creatureOnSet: boolean;
  creatureIn: boolean;
};

export type Brief = {
  title: string;
  ask: string;
  /** Null when the frame meets the brief, otherwise what is off. */
  test: (m: Measure) => string | null;
};

const nearest = (m: Measure): PieceInFrame | undefined =>
  m.actors.reduce<PieceInFrame | undefined>((a, b) => (a == null || b.distanceM < a.distanceM ? b : a), undefined);
const THIRD = 1 / 3;

export const BRIEFS: Brief[] = [
  {
    title: 'Wide establishing shot',
    ask: 'Everyone and the creature in frame, on 35 mm or wider.',
    test: (m) => {
      if (m.lensMm > 35) return `${m.lensMm} mm is too long. Go to 35 mm or wider.`;
      const missing = m.actors.find((a) => !a.whole);
      if (missing) return `${missing.label} is not fully in frame.`;
      return !m.creatureOnSet || m.creatureIn ? null : 'The creature is out of frame.';
    },
  },
  {
    title: 'Low-angle hero',
    ask: 'Lens at least 0.5 m below an actor, looking up at them.',
    test: (m) => {
      const a = nearest(m);
      if (a == null || !a.eyesIn) return 'Get an actor in frame.';
      if (a.eyeAboveLensM < 0.5) return `Lens is only ${a.eyeAboveLensM.toFixed(1)} m below ${a.label}. Go lower.`;
      return m.tiltDeg > 3 ? null : 'Tilt the camera up at them.';
    },
  },
  {
    title: 'High angle',
    ask: 'Lens at least 1 m above an actor, looking down on them.',
    test: (m) => {
      const a = nearest(m);
      if (a == null || !a.eyesIn) return 'Get an actor in frame.';
      if (-a.eyeAboveLensM < 1) return `Lens is ${(-a.eyeAboveLensM).toFixed(1)} m above ${a.label}. Raise it.`;
      return m.tiltDeg < -3 ? null : 'Tilt the camera down at them.';
    },
  },
  {
    title: 'Close-up',
    ask: 'One face filling at least a quarter of the frame height.',
    test: (m) => {
      const a = m.actors.reduce<PieceInFrame | undefined>((x, y) => (x == null || y.headSize > x.headSize ? y : x), undefined);
      if (a == null || !a.eyesIn) return 'Get an actor in frame.';
      const pct = Math.round(a.headSize * 100);
      return a.headSize >= 0.25 ? null : `${a.label}'s head is ${pct}% of the frame. Move in or use a longer lens.`;
    },
  },
  {
    title: 'Two-shot',
    ask: 'Both actors with their eyes in frame, at similar size.',
    test: (m) => {
      if (m.actors.length < 2) return 'This needs two actors.';
      const [a, b] = m.actors;
      if (!a.eyesIn || !b.eyesIn) return 'Get both faces in frame.';
      const ratio = Math.max(a.headSize, b.headSize) / Math.max(1e-3, Math.min(a.headSize, b.headSize));
      return ratio <= 1.5 ? null : 'One actor is much closer. Stand them level with the lens.';
    },
  },
  {
    title: 'Over the shoulder',
    ask: 'One actor close to the lens, the other further off and facing us.',
    test: (m) => {
      if (m.actors.length < 2) return 'This needs two actors.';
      const sorted = [...m.actors].sort((x, y) => x.distanceM - y.distanceM);
      const [near, far] = sorted;
      if (near.distanceM > 1.5) return `${near.label} is ${near.distanceM.toFixed(1)} m away. Bring them within 1.5 m.`;
      if (far.distanceM < near.distanceM * 2) return `${far.label} should be at least twice as far as ${near.label}.`;
      return far.eyesIn ? null : `${far.label} is out of frame.`;
    },
  },
  {
    title: 'Rule of thirds',
    ask: 'The nearest actor with their eyes on a thirds crossing.',
    test: (m) => {
      const a = nearest(m);
      if (a == null || !a.eyesIn) return 'Get an actor in frame.';
      const x = Math.abs(Math.abs(a.eyeX) - THIRD);
      const y = Math.abs(a.eyeY - THIRD);
      if (x > 0.12) return `Move ${a.label} ${Math.abs(a.eyeX) < THIRD ? 'further from the centre' : 'towards the centre'}.`;
      return y > 0.12 ? (a.eyeY < THIRD ? 'Their eyes are low. Tilt down.' : 'Their eyes are high. Tilt up.') : null;
    },
  },
  {
    title: 'Creature reveal',
    ask: 'Creature in frame, with an actor looking up at it on a long lens.',
    test: (m) => {
      if (!m.creatureOnSet) return 'Add the creature from Assets.';
      if (!m.creatureIn) return 'The creature is out of frame.';
      if (m.lensMm < 50) return `${m.lensMm} mm is too wide. Go to 50 mm or longer.`;
      return m.actors.some((a) => a.eyesIn) ? null : 'Keep an actor in frame with it.';
    },
  },
  {
    title: 'Aerial',
    ask: 'On the drone, at least 6 m up, looking well down.',
    test: (m) => {
      if (m.rig !== 'drone') return 'Switch the camera to the drone.';
      if (m.heightM < 6) return `Drone is at ${m.heightM.toFixed(1)} m. Take it above 6 m.`;
      return m.tiltDeg <= -35 ? null : 'Tilt it further down at the set.';
    },
  },
];
