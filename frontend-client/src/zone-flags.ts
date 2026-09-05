/**
 * Zone.js flags — must be imported BEFORE zone.js.
 * Guards against SSR (Node.js) where `window` doesn't exist.
 */
if (typeof window !== 'undefined') {
  // Prevent zone.js from patching CSS animation & transition events.
  // These fire hundreds of times/sec and cause 'target is not defined' errors
  // in zone.js globalCallback, corrupting Angular change detection.
  (window as any).__zone_symbol__UNPATCHED_EVENTS = [
    'animationstart',
    'animationend',
    'animationiteration',
    'animationcancel',
    'transitionstart',
    'transitionend',
    'transitionrun',
    'transitioncancel',
  ];
}
