import dataURI from "../dataURI"
import {Base64} from "../Base64"
import {WebAudio} from "./WebAudio"
import {MIDI} from "../MIDI"
import {Hooray} from "../Hooray"
import {ezDefine} from "../ezDefine"

let eventResponder
export const BufferStore = Hooray.create({name})

ezDefine(BufferStore, {
	startProcessing() {
		MIDI.programs.map((program, programID) => BufferStore.processProgram(programID, program))
		eventResponder = MIDI.programs.onLoad(BufferStore.processProgram)
	},

	stopProcessing() {
		eventResponder.cancel()
	},

	processProgram(programID, program, _, onProgress = MIDI.onProgress) {
		const jobs = []
		for (const [noteID, note] of program.notes.entries()) {
			if (!note) continue
			const {noteData} = note
			jobs.push(BufferStore.processNote(programID, noteID, noteData))
		}

		const processJob = Promise.all(jobs)
		MIDI.jobs.track(processJob, `process program ${programID}.`)
		return processJob
	},

	processNote(programID, noteID, noteData) {
		let job
		if (Base64.test(noteData)) {
			job = WebAudio.context.decodeAudioData(Base64.toBuffer(noteData))
		} else if (dataURI.test(noteData)) {
			const audioBuffer = dataURI.toBuffer(noteData)
			job = WebAudio.context.decodeAudioData(audioBuffer)
		} else {
			job = MIDI.fetch({
				URL: noteData,
				onProgress,
				responseType: "arraybuffer",
			}).then(function (event) {
				const response = new ArrayBuffer()
				return WebAudio.context.decodeAudioData(response)
			})
		}

		return (
			job
				.then(audioBuffer => BufferStore.set(programID, noteID, audioBuffer))
				.catch(error => console.log(error)))
	},
})