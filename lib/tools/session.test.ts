import assert from 'node:assert/strict';
import test from 'node:test';
import { saviTools } from './catalog.ts';
import { inputIssue, jsonExecutionInput, quoteCanExecute, quoteParameters, toolContract, voiceScript, type ToolInput } from './session.ts';

const input: ToolInput = { prompt: 'A short test brief', quality: '1080', aspectRatio: '1:1', style: 'Realistic', duration: '6', withAudio: true, voice: 'Kore', tone: 'natural', radioFormat: 'solo', radioLength: 'short', pages: 'all' };

test('the shared Web catalog exposes exactly the enabled production tools to native adapters', () => {
  assert.equal(saviTools.length, 31);
  assert.equal(new Set(saviTools.map(tool => tool.id)).size, 31);
  for (const [category, count] of [['Images', 14], ['Video', 7], ['Voice', 2], ['Files', 8]] as const) assert.equal(saviTools.filter(tool => tool.category === category).length, count);
  assert.equal(toolContract('extract_images'), null);
  for (const tool of saviTools) {
    const contract = toolContract(tool.id)!;
    assert.ok(contract);
    assert.ok(contract.endpoint.startsWith('/api/'));
    assert.equal(quoteParameters(contract, input, []).toolId, contract.executionId);
  }
});

test('native request adapters retain the same idempotency key and omit client account authority', () => {
  for (const tool of saviTools.filter(tool => tool.category !== 'Files')) {
    const contract = toolContract(tool.id)!;
    const first = jsonExecutionInput(contract, input, [], 'mobile_request_123');
    assert.deepEqual(first, jsonExecutionInput(contract, input, [], 'mobile_request_123'));
    assert.equal(first.clientRequestId, 'mobile_request_123');
    assert.equal(first.toolId, contract.executionId);
    assert.ok(!('userId' in first) && !('email' in first) && !('credits' in first));
  }
});

test('voice quotes measure the actual radio script, and video options map to existing server inputs', () => {
  const radio = toolContract('radio')!;
  assert.equal(Number(quoteParameters(radio, input, []).textCharacters), voiceScript(radio, input).length);
  const video = jsonExecutionInput(toolContract('text_video')!, { ...input, aspectRatio: '9:16', duration: '8' }, [], 'mobile_request_123');
  assert.ok('quality' in video && 'ratio' in video && 'duration' in video);
  assert.equal(video.quality, '720');
  assert.equal(video.ratio, '9:16');
  assert.equal(video.duration, '8');
});

test('file requirements and insufficient-credit states prevent premature execution', () => {
  assert.ok(inputIssue(toolContract('merge')!, input, [], []));
  const file = { uri: 'file:///fixture.pdf', name: 'fixture.pdf', mimeType: 'application/pdf', size: 300, pageCount: 2 };
  assert.ok(inputIssue(toolContract('split')!, input, [file], []));
  assert.equal(inputIssue(toolContract('split')!, input, [file], [{ pageNumber: 1, rotation: 0, selected: true }]), null);
  for (const id of ['first_last', 'image_video', 'product_ad', 'social_reel', 'extend']) assert.ok(inputIssue(toolContract(id)!, input, [], []));
  assert.equal(quoteCanExecute(100, 99), false);
  assert.equal(quoteCanExecute(null, 500), false);
  assert.equal(quoteCanExecute(100, null), false);
  assert.equal(quoteCanExecute(100, 100), true);
});
