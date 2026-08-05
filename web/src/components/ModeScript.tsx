/**
 * Applies the saved mode before first paint, exactly as ThemeScript does for
 * the palette. Runs as a blocking inline script — deliberately.
 *
 * The mode decides the accent colour and which nav items exist, so getting
 * it after hydration would mean the top bar visibly rearranging itself on
 * every page load. `brain` is the neutral default and the fallback if
 * localStorage is unavailable or holds something unrecognised.
 */
export default function ModeScript() {
  const js = `(function(){try{var m=localStorage.getItem('brain-mode');if(m!=='life'&&m!=='empire')m='brain';document.documentElement.setAttribute('data-mode',m);}catch(e){document.documentElement.setAttribute('data-mode','brain');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
