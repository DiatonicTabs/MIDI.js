const Debug = require('debug')
const debug = Debug('MIDI.js:src/Channel.js')

const MIDI = require('./MIDI')
const actionStack = require('./actionStack')

const Channel = module.exports = class Channel {
	constructor(channelID) {
		this.channelID = channelID
		Channel.onConstruct.trigger(this)
		debug('Channel %s, ready for action!', channelID)
	}

	noteOn(noteID, velocity, delay) {
		return MIDI.noteOn(this.channelID, noteID, velocity, delay)
	}

	noteOff(noteID, delay) {
		return MIDI.noteOff(this.channelID, noteID, delay)
	}
}

Channel.onConstruct = actionStack()