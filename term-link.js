// Связь дриллов со словарём: рендер прозы с инлайн-ссылками на термины.
// Маркер [[id|видимый текст]] (сокращение [[id]]) превращается в кликабельный
// элемент, если id известен глоссарию; иначе остаётся обычным текстом.
// См. docs/adr/0001-manual-glossary-linking.md и CONTEXT.md.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SquashTermLink = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  const MARKER = /\[\[([^\]|]+?)(?:\|([^\]]*?))?\]\]/g;

  function renderProse(str, lookup) {
    let out = '';
    let last = 0;
    let m;
    MARKER.lastIndex = 0;
    while ((m = MARKER.exec(str)) !== null) {
      out += escapeHtml(str.slice(last, m.index));
      const id = m[1].trim();
      const display = m[2];
      const term = lookup(id);
      if (term) {
        const text = display != null ? display : term.ru;
        out += `<button type="button" class="term-ref" data-term="${escapeHtml(id)}">${escapeHtml(text)}</button>`;
      } else {
        out += escapeHtml(display != null ? display : id);
      }
      last = m.index + m[0].length;
    }
    out += escapeHtml(str.slice(last));
    return out;
  }

  return { renderProse, escapeHtml };
});
