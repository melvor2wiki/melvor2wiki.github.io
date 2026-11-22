(() => {
  const config = window.WIKI_CONFIG?.analytics;
  if (location.origin !== 'https://melvor2wiki.github.io' || !config ||
      navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  const sections = {
    '':'home', scheda:'entry', categoria:'category', cerca:'search', famiglia:'family', famiglie:'family',
    esperienza:'experience', idle:'idle', money:'money', pets:'pets', guides:'guides', guide:'guide', suggest:'feedback'
  };
  const storageKey = 'wiki-traffic-last-page';
  let lastPage, lastSeen = 0;

  function record() {
    if (document.visibilityState === 'hidden') return;
    const [screen, raw] = location.hash.slice(2).split('?',2);
    if (!Object.hasOwn(sections,screen)) return;
    const id = new URLSearchParams(raw).get('id') || '';
    const page = screen+'/'+id;
    if (page === lastPage) return;
    lastPage = page;
    const now = Date.now();
    try { lastSeen = Math.max(lastSeen,Number(sessionStorage.getItem(storageKey)) || 0); } catch {}
    const newVisit = now-lastSeen >= 30*60*1000;
    lastSeen = now;
    try { sessionStorage.setItem(storageKey,String(now)); } catch {}
    fetch(config.url,{
      method:'POST', keepalive:true, credentials:'omit', referrerPolicy:'no-referrer',
      headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({section_name:sections[screen],new_visit:newVisit})
    }).catch(()=>{});
  }

  window.addEventListener('hashchange',record);
  document.addEventListener('visibilitychange',record);
  record();
})();
