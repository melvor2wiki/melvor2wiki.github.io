function publicSuggest(params) {
  const page = (params.get('page') || 'Main Page').slice(0, 200);
  const rawPath = params.get('path') || '#';
  const path = rawPath.startsWith('#') ? rawPath.slice(0, 1800) : '#';
  const endpoint = window.WIKI_CONFIG?.suggestionEndpoint;
  const connected = /^https:\/\/formsubmit\.co\/ajax\/[a-f0-9]{32}$/.test(endpoint || '');
  main.innerHTML = '<h1>Suggest an edit</h1><p>Found something missing or incorrect? Send a suggestion here. No account needed.</p>' +
    '<form id="suggest-form"><label>Wiki page<input name="page" required maxlength="200" value="' + escape(page) + '"></label>' +
    '<label>Your suggestion<textarea name="change" required minlength="10" maxlength="5000" rows="8" placeholder="Tell us what should change, be added or be explained better."></textarea></label>' +
    '<div class="feedback-honeypot" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
    '<button type="submit"' + (connected ? '' : ' disabled') + '>Send suggestion</button><p id="suggest-status" role="status" aria-live="polite"></p>' +
    '<p class="feedback-privacy">Sent privately to the wiki maintainer by email via <a href="https://formsubmit.co/privacy.pdf" target="_blank" rel="noopener noreferrer">FormSubmit</a>. Please do not include passwords or personal save files.</p></form>';
  const form = document.getElementById('suggest-form');
  const button = form.querySelector('button[type="submit"]');
  const message = form.elements.change;
  const status = document.getElementById('suggest-status');
  let sending = false, sent = false;
  if (!connected) status.textContent = 'Suggestions are temporarily unavailable. Please try again later.';
  message.addEventListener('input', () => { if (connected && sent) { sent = false; button.disabled = false; status.textContent = ''; delete status.dataset.state; } });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || sent || !connected || !form.reportValidity()) return;
    const text = message.value.trim();
    if (text.length < 10) { status.textContent = 'Please write at least 10 characters.'; message.focus(); return; }
    if (form.elements.website.value) { status.textContent = 'Suggestion sent. Thank you!'; return; }
    let last = 0;
    try { last = Number(sessionStorage.getItem('melvorSuggestionLastSent') || 0); } catch {}
    const remaining = Math.ceil((30000 - (Date.now() - last)) / 1000);
    if (remaining > 0) { status.textContent = 'Please wait ' + remaining + ' seconds before sending another suggestion.'; return; }
    sending = true; button.disabled = true; button.textContent = 'Sending…'; status.textContent = 'Sending your suggestion…'; delete status.dataset.state;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20000);
    try {
      const pageTitle = form.elements.page.value.trim().slice(0, 200);
      const response = await fetch(endpoint, {
        method: 'POST', signal: abort.signal, credentials: 'omit', referrerPolicy: 'origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: '[Melvor 2 Wiki] Suggestion: ' + pageTitle.replace(/[\r\n]/g, ' '),
          _captcha: 'false', _template: 'table', _url: 'https://melvor2wiki.github.io/',
          wiki_page: pageTitle, page_url: 'https://melvor2wiki.github.io/' + path, suggestion: text
        })
      });
      const result = await response.json();
      if (!response.ok || !(result.success === true || result.success === 'true')) throw new Error('Submission not accepted');
      try { sessionStorage.setItem('melvorSuggestionLastSent', String(Date.now())); } catch {}
      status.textContent = 'Suggestion sent. Thank you!'; status.dataset.state = 'success';
      message.value = ''; sent = true;
    } catch {
      status.textContent = 'Could not confirm delivery. Your text is still here. Please wait a moment before trying again.';
      status.dataset.state = 'error';
    } finally {
      clearTimeout(timer); sending = false; button.disabled = sent; button.textContent = 'Send suggestion';
    }
  });
}

