/**
 * Where a moving vehicle and an actor meet, shared by the rule that knocks the
 * actor down and the roll that stops the vehicle. Stage metres.
 */
/** How fast a vehicle or creature has to be going to knock an actor down, in stage metres a second. */
export const KNOCK_SPEED = 0.1;
/** How close to a mover's shape an actor has to be for the two to touch. */
export const ACTOR_REACH = 0.03;
/**
 * How close a mover's shape has to come to a horse or a wolf for the two to touch. A rolling
 * vehicle stops 2 cm short of a solid piece, give or take a step, so this reaches past that:
 * the animal a roll stopped against goes over on playback as it did live.
 */
export const ANIMAL_REACH = 0.045;
