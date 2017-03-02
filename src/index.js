export {default as MIDI} from './MIDI'

import autoselectSampleFormat from './autoselectSampleFormat'
import autoselectSoundModule from './soundModule/autoselectSoundModule'
export const autoselect = {
	sampleFormat: autoselectSampleFormat,
	soundModule: autoselectSoundModule
}

import Pad from './controllers/Pad'
export const controllers = {
	Pad
}