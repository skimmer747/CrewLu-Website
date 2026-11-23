/* Homepage top bar: the live Zulu clock and the "More" menu. */
(function () {

	// Zulu clock.
	var zulu = document.getElementById('deck-zulu');
	if (zulu) {
		var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
		var tick = function () {
			var d = new Date();
			zulu.textContent = p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds());
		};
		tick();
		setInterval(tick, 1000);
	}

	// "More" menu. Without this script the CSS opens it on hover or keyboard focus. Once the script
	// runs it marks the menu .is-js and owns the open state, so a second click, Escape and
	// aria-expanded all agree with what is on screen.
	var more = document.querySelector('.deck-bar__more');
	if (!more) return;
	var btn = more.querySelector('button');
	var hovering = false, hoverOpenedAt = 0;
	var isOpen = function () { return more.classList.contains('is-open'); };
	var set = function (open) {
		more.classList.toggle('is-open', open);
		btn.setAttribute('aria-expanded', String(open));
	};
	more.classList.add('is-js');

	// Mouse: open on hover, close on leave. Touch and pen go through the click handler instead.
	more.addEventListener('pointerenter', function (e) {
		if (e.pointerType !== 'mouse') return;
		hovering = true;
		if (!isOpen()) { hoverOpenedAt = Date.now(); set(true); }
	});
	more.addEventListener('pointerleave', function (e) {
		if (e.pointerType !== 'mouse') return;
		hovering = false;
		set(false);
	});

	// Click or tap toggles. A click that lands just after the hover opened it is not a request to close.
	btn.addEventListener('click', function () {
		if (isOpen() && Date.now() - hoverOpenedAt < 400) return;
		set(!isOpen());
	});

	// Keyboard: close when focus leaves the menu (but not while the mouse is still over it, because
	// Safari reports no new focus target when a link is clicked), and on Escape.
	more.addEventListener('focusout', function (e) {
		if (!hovering && !more.contains(e.relatedTarget)) set(false);
	});
	document.addEventListener('click', function (e) { if (!more.contains(e.target)) set(false); });
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && isOpen()) { set(false); btn.focus(); }
	});

})();
