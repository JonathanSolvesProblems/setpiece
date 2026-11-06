/**
 * Stands in for @pmndrs/uikit-lucide in the production build. The UI kit imports
 * every icon by name, which was 40% of the bundle a headset must parse on each
 * load, and the panel draws none of them. These two keep Horizon's checkbox and
 * dropdown classes defined; nothing here renders either.
 */
import { Svg } from '@pmndrs/uikit';

export class CheckIcon extends Svg {}
export class ChevronDownIcon extends Svg {}
