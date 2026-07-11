/* WedFlow analytics — one file for marketing pages and the app.
 * Privacy-preserving: session recording off, honors Do Not Track, and
 * capture is OFF until the visitor accepts the cookie banner (opt-out by default).
 * In the app (/app) autocapture is disabled so guest names / wedding data in the
 * DOM are never captured; only explicit track() events + screen views are sent. */
(function () {
  var IS_APP = location.pathname === '/app' || location.pathname.indexOf('/app/') === 0;
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init('phc_nLrZQ3vKgCeZpAMaAfMoagbKnJELcdk5eZpL8uyzojeS', {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: IS_APP ? 'history_change' : true,
    autocapture: !IS_APP,
    disable_session_recording: true,
    respect_dnt: true,
    opt_out_capturing_by_default: true,
    opt_out_capturing_persistence_type: 'localStorage'
  });
  if (IS_APP) posthog.register({ surface: 'app' });

  var KEY = 'wf_consent';
  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}
  if (choice === 'granted') { posthog.opt_in_capturing(); return; }
  if (choice === 'denied') { return; }

  function decide(granted) {
    try { localStorage.setItem(KEY, granted ? 'granted' : 'denied'); } catch (e) {}
    if (granted) posthog.opt_in_capturing(); else posthog.opt_out_capturing();
    var el = document.getElementById('wf-consent'); if (el) el.parentNode.removeChild(el);
  }
  function show() {
    if (document.getElementById('wf-consent')) return;
    var d = document.createElement('div'); d.id = 'wf-consent'; d.setAttribute('dir', 'rtl');
    d.innerHTML = '<style>#wf-consent{position:fixed;inset-inline:0;bottom:0;z-index:2147483000;background:#fffdf9;border-top:1px solid #e8ddcd;box-shadow:0 -6px 24px rgba(59,53,49,.10);font-family:Heebo,system-ui,sans-serif;color:#3b3531}#wf-consent .w{max-width:1140px;margin:0 auto;padding:.85rem 1.25rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap;justify-content:space-between}#wf-consent p{margin:0;font-size:.9rem;line-height:1.55;flex:1 1 300px}#wf-consent a{color:#a5674e;text-decoration:underline}#wf-consent .b{display:flex;gap:.5rem;flex:0 0 auto}#wf-consent button{font:inherit;font-weight:700;font-size:.9rem;border-radius:999px;padding:.5rem 1.3rem;cursor:pointer;border:1px solid #e8ddcd;background:#fff;color:#3b3531}#wf-consent button.ok{background:linear-gradient(115deg,#dba689,#c68a70 45%,#a5674e);color:#fff;border:0}</style>'
      + '<div class="w"><p>אנחנו משתמשים בעוגיות לניתוח שימוש בסיסי, כדי לשפר את WedFlow. אפשר לקרוא עוד ב<a href="/privacy/">מדיניות הפרטיות</a>.</p>'
      + '<div class="b"><button type="button" class="no">דחייה</button><button type="button" class="ok">אישור</button></div></div>';
    document.body.appendChild(d);
    d.querySelector('.ok').addEventListener('click', function () { decide(true); });
    d.querySelector('.no').addEventListener('click', function () { decide(false); });
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
