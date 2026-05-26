const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderProse } = require('./term-link.js');

const knows = (...ids) => (id) => (ids.includes(id) ? { id, ru: id.toUpperCase() } : null);

test('проза без маркеров возвращается экранированной, без ссылок', () => {
  const html = renderProse('Бей <сильно> по "мячу"', () => null);
  assert.equal(html, 'Бей &lt;сильно&gt; по &quot;мячу&quot;');
  assert.ok(!html.includes('term-ref'));
});

test('[[id|текст]] известного термина → кнопка с data-term и видимым текстом', () => {
  const html = renderProse('бьёшь [[drive|драйвом]] вдоль стены', knows('drive'));
  assert.equal(
    html,
    'бьёшь <button type="button" class="term-ref" data-term="drive">драйвом</button> вдоль стены'
  );
});

test('неизвестный id → видимый текст без ссылки', () => {
  const html = renderProse('делай [[xyz|финт]] быстро', knows('drive'));
  assert.equal(html, 'делай финт быстро');
});

test('сокращение [[id]] без текста → ru-форма термина', () => {
  const lookup = (id) => (id === 't' ? { id: 't', ru: 'Точка T' } : null);
  const html = renderProse('контролируй [[t]] корта', lookup);
  assert.equal(
    html,
    'контролируй <button type="button" class="term-ref" data-term="t">Точка T</button> корта'
  );
});

test('несколько маркеров в строке: известный, неизвестный и экранирование вокруг', () => {
  const html = renderProse(
    'играй [[drive|драйв]] или [[boast|бэст]], но не "[[xyz|финт]]" <тут>',
    knows('drive', 'boast')
  );
  assert.equal(
    html,
    'играй <button type="button" class="term-ref" data-term="drive">драйв</button>' +
      ' или <button type="button" class="term-ref" data-term="boast">бэст</button>,' +
      ' но не &quot;финт&quot; &lt;тут&gt;'
  );
});
