const Debug = require('debug')
const debug = Debug('MIDI.js:webaudio')

const MIDI = require('./MIDI')
const GeneralMIDI = require('./GeneralMIDI')
const dataURI = require('./dataURI')
const ScheduledSound = require('./ScheduledSound')
const ChannelProxy = require('./ChannelProxy')

const ctx = createAudioContext()

const bufferDB = new Map()
bufferDB.id = function (programID, noteID) {
	return `${programID}x${noteID}`
}

const scheduledSounds = []
scheduledSounds.selectScheduledSoundsRequiringUpdate = function (object) {
	if (object instanceof ChannelProxy) {
		return scheduledSounds.filter(function (task) {
			return task.channelID === object.channelID
		})
	}

	return scheduledSounds
}

MIDI.onPropertyChange(function (selector, property, newValue) {
	debug('Property change detected! Updating tasks...')
	scheduledSounds.selectScheduledSoundsRequiringUpdate(selector).forEach(function (task) {
		task.updateProperties()
	})
})

const webaudio = {
	connect() {
		debug('Connecting the Web Audio sound module.')

		// WARNING - this adds properties directly to MIDI. It's kind of dirty.
		// TODO MIDI.js should proxy all calls to the sound modules
		//addCustomProperties()
		addCommands()
		MIDI.soundModule = this

		// Hook into program loading for post-processing
		const originalLoadProgram = MIDI.loadProgram
		MIDI.loadProgram = function () {
			debug('HOOK! WebAudioSM will post-process the program when it loads.')
			return originalLoadProgram.apply(MIDI, arguments).then(webaudio.processProgram)
		}

		const connectOp = new Promise(function (resolve, reject) {
			// Use globals instead and shim.
			if (window.Tuna) {
				debug('Adding TunaJS support...')
				if (!(ctx.tunajs instanceof Tuna)) {
					ctx.tunajs = new Tuna(ctx);
				}
			}

			MIDI.asyncOperations.filter(function (operation) {
				return operation.isLoadProgram
			}).forEach(function (loadOp) {
				loadOp.then(webaudio.processProgram)
			})

			resolve()
		})

		connectOp.isConnect = true
		MIDI.asyncOperations.push(connectOp)
		return connectOp
	},

	processProgram({programID, program, onProgress = MIDI.onProgress}) {
		if (typeof programID === 'undefined') {
			debug('I cannot process a program without a programID: %o', {
				programID,
				program
			})
			const rejection = Promise.reject
			MIDI.asyncOperations.push(rejection)
			return rejection
		}

		function noteHandler_string(noteContents) {
			if (dataURI.test(noteContents)) {
				return ctx.decodeAudioData(dataURI.toBuffer(noteContents))
			} else {
				return MIDI.doFetch({
					URL: noteContents,
					onProgress,
					responseType: 'arraybuffer'
				}).then(function (event) {
					console.log(arguments)
					debugger
					const response = new ArrayBuffer()
					return ctx.decodeAudioData(response)
				})
			}
		}

		function noteHandler_object(noteContents) {

		}

		const {__METADATA, ...notes} = program
		console.log(notes)
		const bufferJobs = Object.keys(notes).map(function (note) {
			const noteID = GeneralMIDI.getNoteNumber(note)
			if (!noteID) {
				debug('I cannot process a note that does not have a valid note number: %o', {
					noteID,
					note
				})
				// Rejecting would cause the whole thing to come crashing down.
				// Instead, might as well just skip this note.
				return Promise.resolve()
			}

			const noteContents = program[note]
			debug('Processing note: %o', {noteID, note, noteContents})

			function storeBuffer(audioBuffer) {
				const bufferID = bufferDB.id(programID, noteID)
				debug('Storing audio buffer: %o', {bufferID, audioBuffer})
				bufferDB.set(bufferID, audioBuffer)
			}

			// Currently, if the sample is a data URI then we shortcut and
			// just decode the sample. If it's not, I assume that sample is a URL.
			switch(typeof noteContents) {
				case 'object':
					return noteHandler_string(noteContents.data).then(storeBuffer)
				case 'string':
				default:
					return noteHandler_string(noteContents).then(storeBuffer)
			}
		})

		const processOp = Promise.all(bufferJobs)
		processOp.isProcessProgram = true
		MIDI.asyncOperations.push(processOp)
		return processOp
	}
}

function createAudioContext() {
	const ctx = new (window.AudioContext || window.webkitAudioContext)()
	try {
		const buffer = ctx.createBuffer(1, 1, 44100);
		const source = ctx.createBufferSource();
		source.detune.value = 1200
		ctx.hasDetune = true
	} catch (e) {
		debug('Detune is not supported on this platform')
	}

	return ctx
}


//		function prepareFX(channel) {
//			var fxNodes = channel.fxNodes || (channel.fxNodes = {});
//			for (var key in fxNodes) {
//				fxNodes[key].disconnect(ctx.destination);
//				delete fxNodes[key];
//			}
//			if (ctx.tunajs) {
//				var fx = channel.fx;
//				for (var i = 0; i < fx.length; i++) {
//					var data = fx[i];
//					var type = data.type;
//					var effect = new ctx.tunajs[type](data);
//					effect.connect(ctx.destination);
//					fxNodes[type] = effect;
//				}
//			} else {
//				MIDI.DEBUG && console.error('fx not installed.', arguments);
//			}
//		}
//	};
//}

function addCommands() {
	MIDI.noteOn = function (channelID, noteID, velocity = 127, delay = 0) {
		noteID = GeneralMIDI.getNoteNumber(noteID)

		const programID = MIDI.channels[channelID].programID
		const bufferID = bufferDB.id(programID, noteID)

		if (!bufferDB.has(bufferID)) {
			debug('An attempt was made to play a note in a program without an associated buffer: %o', bufferID)
			// TODO Should something be returned here? A fake sound task?
			return
		}

		const audioBuffer = bufferDB.get(bufferID)
		debug('Playing note: %o', {bufferID, audioBuffer, programID, channelID, noteID, velocity, delay})
		const task = new ScheduledSound({
			channelID,
			noteID,

			inContext: ctx,
			audioBuffer,
			velocity,
			delay
		})

		scheduledSounds.push(task)
		return task
	}

	MIDI.noteOff = function (channelID, noteID, delay = 0) {
		noteID = GeneralMIDI.getNoteNumber(noteID)

		scheduledSounds.filter(function(sound) {
			return sound.channelID === channelID && sound.noteID === noteID && !sound.isEnding
		}).forEach(function(sound) {
			sound.scheduleFadeOut(ctx.currentTime + delay)
		})
	};


	MIDI.cancelNotes = function (channelId) {
		if (isFinite(channelId)) {
			stopChannel(channelId);
		} else {
			for (var channelId in _scheduled) {
				stopChannel(channelId);
			}
		}

		function stopChannel(channelId) {
			loopChannel(channelId, function (sources, source) {
				fadeOut(sources, source);
			});
		}
	};


	/** unlock **/
	MIDI.iOSUnlock = function () {
		if (ctx.unlocked !== true) {
			ctx.unlocked = true;
			var buffer = ctx.createBuffer(1, 1, 44100);
			var source = ctx.createBufferSource();
			source.buffer = buffer;
			source.connect(ctx.destination);
			source.start(0);
		}
	};
}

module.exports = webaudio
module.exports.bufferDB = bufferDB
module.exports.tasks = scheduledSounds
module.exports.ctx = ctx