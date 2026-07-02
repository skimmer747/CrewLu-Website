/* NIGHT OPS scroll-reveal — vanilla, reduced-motion safe.
   CSS only hides elements when .reveal-ready is set below, so
   no-JS and reduced-motion users always see static content. */
(function () {
	var mql = window.matchMedia('(prefers-reduced-motion: no-preference)');
	if (!('IntersectionObserver' in window) || !mql.matches) return;
	document.documentElement.classList.add('reveal-ready');
	var els = document.querySelectorAll('#main .post, .feature-card, .clu-portal, #main header.major');
	var io = new IntersectionObserver(function (entries) {
		entries.forEach(function (entry) {
			if (entry.isIntersecting) {
				entry.target.classList.add('is-in');
				io.unobserve(entry.target);
			}
		});
	}, { rootMargin: '0px 0px -8% 0px' });
	els.forEach(function (el, i) {
		el.style.transitionDelay = (i % 4) * 80 + 'ms';
		io.observe(el);
	});
})();
