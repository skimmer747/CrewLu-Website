/* Shared cookie-consent + Google Analytics gate for all CrewLu pages.
   Was inlined (byte-identical) in the <head> and body of every page; extracted
   here 2026-07 (Night Ops Stage 3). Load with: <script src="assets/js/cookie-consent.js" defer></script>
   Deferred execution runs after DOM parse and before DOMContentLoaded, so the
   banner-show listener still fires; GA loading a few ms later is harmless. */

// Initialize dataLayer before GA loads
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }

// Load GA4 immediately if consent was already granted in a prior visit
if (localStorage.getItem('crewlu_analytics_consent') === 'granted') {
	loadGoogleAnalytics();
}

function loadGoogleAnalytics() {
	// Set default consent to denied
	gtag('consent', 'default', {
		'analytics_storage': 'denied',
		'ad_storage': 'denied'
	});

	// Update consent to granted
	gtag('consent', 'update', {
		'analytics_storage': 'granted'
	});

	// Load GA4 script
	var script = document.createElement('script');
	script.async = true;
	script.src = 'https://www.googletagmanager.com/gtag/js?id=G-1LNXKYWTL9';
	document.head.appendChild(script);

	script.onload = function () {
		gtag('js', new Date());
		// Configure with IP anonymization and privacy settings
		gtag('config', 'G-1LNXKYWTL9', {
			'anonymize_ip': true,
			'allow_google_signals': false,
			'allow_ad_personalization_signals': false
		});
	};
}

// Expose consent functions globally (called from banner button onclick handlers)
window.grantAnalyticsConsent = function () {
	localStorage.setItem('crewlu_analytics_consent', 'granted');
	localStorage.setItem('crewlu_analytics_consent_date', new Date().toISOString());
	loadGoogleAnalytics();
	hideConsentBanner();
};

window.denyAnalyticsConsent = function () {
	localStorage.setItem('crewlu_analytics_consent', 'denied');
	localStorage.setItem('crewlu_analytics_consent_date', new Date().toISOString());
	hideConsentBanner();
};

window.revokeAnalyticsConsent = function () {
	localStorage.removeItem('crewlu_analytics_consent');
	localStorage.removeItem('crewlu_analytics_consent_date');
	// Disable GA4
	if (window.gtag) {
		gtag('consent', 'update', {
			'analytics_storage': 'denied'
		});
	}
	alert('Your consent has been revoked. Analytics tracking is now disabled. Please refresh the page for changes to take full effect.');
};

function hideConsentBanner() {
	var banner = document.getElementById('cookie-consent-banner');
	if (banner) {
		banner.style.display = 'none';
	}
}

// Show the consent banner if no choice has been made yet
document.addEventListener('DOMContentLoaded', function () {
	if (!localStorage.getItem('crewlu_analytics_consent')) {
		var banner = document.getElementById('cookie-consent-banner');
		if (banner) banner.classList.add('show');
	}
});
