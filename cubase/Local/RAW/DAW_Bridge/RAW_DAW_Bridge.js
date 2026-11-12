// RAW v5.46: MIDI Remote adapter for original Bettermaker/WesAudio VST3 pilot.
// Expects RAW_TO_CUBASE (loopMIDI on studio Windows PC).
// CC21..24 -> Focused Quick Controls 1..4 (8 configured for future use).
// Cubase operator must manually assign *original plugin* parameters to
// Focused Quick Controls; no VST parameter identity is assumed.
// Offline hardware disconnected? A moving plugin control is NOT proof of HW.
// ES5 for Steinberg MIDI Remote API v1 (Cubase 12+).
var midiremote_api = require('midiremote_api_v1')
var driver = midiremote_api.makeDeviceDriver('RAW', 'DAW Bridge', 'Remote Studio')
var input = driver.mPorts.makeMidiInput('RAW MIDI input')
driver.makeDetectionUnit().detectSingleInput(input).expectInputNameEquals('RAW_TO_CUBASE')

var knob = driver.mSurface.makeKnob(0, 0, 2, 2)
knob.mSurfaceValue.mMidiBinding.setInputPort(input).bindToControlChange(0, 21).setTypeAbsolute()

var page = driver.mMapping.makePage('RAW Official Plugin Pilot')
page.makeValueBinding(knob.mSurfaceValue, page.mHostAccess.mFocusedQuickControls.getByIndex(0))
for (var i = 1; i < 8; i++) {
  var additionalKnob = driver.mSurface.makeKnob(i * 2, 0, 2, 2)
  additionalKnob.mSurfaceValue.mMidiBinding.setInputPort(input)
    .bindToControlChange(0, 21 + i).setTypeAbsolute()
  page.makeValueBinding(additionalKnob.mSurfaceValue, page.mHostAccess.mFocusedQuickControls.getByIndex(i))
}
