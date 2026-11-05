import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('rack size controls expose 70, 80, 90 and 100 percent', () => {
  const html = read('index.html');
  for (const p of [70,80,90,100]) {
    assert.match(html, new RegExp('data-rack-size="' + p + '"'));
  }
  assert.match(html, /RACK_SIZE_OPTIONS = \[70, 80, 90, 100\]/);
  assert.match(html, /rawRackSizePercent/);
});

test('original rack drawings scale as a whole without overflowing the viewport', () => {
  const html = read('index.html');
  const css = read('style.css');
  assert.match(html, /availableWidth \/ designWidth/);
  assert.match(html, /scale = baselineScale \* factor/);
  assert.match(html, /rack\.style\.position = "absolute"/);
  assert.match(html, /Math\.max\(0, \(availableWidth - visualWidth\) \/ 2\)/);
  assert.match(html, /wrapper\.style\.height =/);
  assert.match(css, /#plugin\.active \.rack-scaled \{[\s\S]*?position: absolute/);
  assert.match(css, /#plugin\.active \.rack-fit \{[\s\S]*?position: relative/);
});

test('scale stays within container width at every size', () => {
  for (const available of [250, 520, 800, 1150, 1600]) {
    for (const percent of [70, 80, 90, 100]) {
      const baseline = Math.min(1.22, available / 1380);
      const visualWidth = 1380 * baseline * percent / 100;
      assert.ok(visualWidth <= available + 0.001,
        'visual rack width should fit: ' + available + ' / ' + percent);
    }
  }
});
