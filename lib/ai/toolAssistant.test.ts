import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalTtsTone,
  canonicalTtsVoice,
  SAVI_GUIDED_TOOL_CONTRACTS,
  SAVI_IMAGE_VIDEO_OPTIONS,
  ttsStyle
} from './toolAssistant.ts';

test('female and male conversational selections map to canonical provider voices', () => {
  assert.equal(canonicalTtsVoice('Female, warm, normal speed'), 'Kore');
  assert.equal(canonicalTtsVoice('Male, energetic, fast'), 'Puck');
  assert.equal(canonicalTtsVoice('Aoede - Smooth storyteller'), 'Aoede');
});

test('tone choices produce deterministic voice direction', () => {
  assert.equal(canonicalTtsTone('Female, warm, normal speed'), 'warm');
  assert.equal(canonicalTtsTone('Formal'), 'formal');
  assert.equal(ttsStyle('warm'), 'Warm text to speech, exact wording, clear natural delivery');
});

test('guided tool contracts expose only supported image-to-video options and require confirmation', () => {
  assert.deepEqual(SAVI_IMAGE_VIDEO_OPTIONS.ratios, ['16:9', '9:16']);
  assert.deepEqual(SAVI_IMAGE_VIDEO_OPTIONS.durations, ['4', '6', '8']);
  assert.deepEqual(SAVI_IMAGE_VIDEO_OPTIONS.qualities, ['720']);
  assert.equal(SAVI_GUIDED_TOOL_CONTRACTS.text_to_speech.confirmationRequired, true);
  assert.equal(SAVI_GUIDED_TOOL_CONTRACTS.image_video.confirmationRequired, true);
});
