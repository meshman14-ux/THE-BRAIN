/**
 * Applies the saved theme before first paint so there's no flash of the
 * wrong palette. Runs as a blocking inline script — deliberately.
 */
export default function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem('brain-theme')||'paper';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','paper');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
