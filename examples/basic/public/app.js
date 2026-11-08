// Sets the language of the page and the component from ?lang=xx.
const lang = new URLSearchParams(window.location.search).get('lang');
if (lang !== null && /^[a-z]{2}$/u.test(lang)) {
  document.documentElement.setAttribute('lang', lang);
  document.querySelector('withdrawal-button')?.setAttribute('lang', lang);
}
