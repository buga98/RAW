// Install this file at:
// Documents/Steinberg/<Cubase version>/MIDI Remote/Driver Scripts/Local/RAW/DAW_Bridge/RAW_DAW_Bridge.js
// Steinberg MIDI Remote API v1, ES5 compatible. One knob only (CC21 channel 1).
var midiremote_api = require('midiremote_api_v1')
var driver = midiremote_api.makeDeviceDriver('RAW', 'DAW Bridge', 'Remote Studio')
var input = driver.mPorts.makeMidiInput('RAW MIDI input')
driver.makeDetectionUnit().detectSingleInput(input).expectInputNameEquals('RAW_TO_CUBASE')

var knob = driver.mSurface.makeKnob(0, 0, 2, 2)
knob.mSurfaceValue.mMidiBinding.setInputPort(input).bindToControlChange(0, 21).setTypeAbsolute()

var page = driver.mMapping.makePage('RAW QC1')
page.makeValueBinding(knob.mSurfaceValue, page.mHostAccess.mFocusedQuickControls.getByIndex(0))
