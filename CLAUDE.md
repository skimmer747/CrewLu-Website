# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is "Massively" - an HTML5 UP template, a text-heavy, article-oriented design with parallax scrolling effects. It's a static HTML/CSS/JavaScript website template released under the Creative Commons Attribution 3.0 License.

## Technology Stack

- **HTML5** - Main structure (index.html, generic.html, elements.html)
- **CSS3** - Styling with Sass preprocessor
- **JavaScript/jQuery** - Interactive components and scroll effects
- **Font Awesome** - Icon library

## Project Structure

```
/
├── index.html          # Main landing page
├── generic.html        # Generic content page template
├── elements.html       # UI elements reference page
├── assets/
│   ├── css/           # Compiled CSS files
│   │   ├── main.css
│   │   ├── noscript.css
│   │   └── fontawesome-all.min.css
│   ├── js/            # JavaScript files
│   │   ├── main.js    # Main application logic
│   │   ├── jquery.min.js
│   │   ├── jquery.scrollex.min.js
│   │   ├── jquery.scrolly.min.js
│   │   ├── breakpoints.min.js
│   │   ├── browser.min.js
│   │   └── util.js
│   ├── sass/          # Source Sass files
│   │   ├── main.scss
│   │   ├── noscript.scss
│   │   ├── base/
│   │   ├── components/
│   │   ├── layout/
│   │   └── libs/
│   └── webfonts/      # Font files for Font Awesome
└── images/            # Image assets directory
```

## Development Commands

### Sass Compilation
To compile Sass files to CSS, use:
```bash
sass assets/sass/main.scss:assets/css/main.css
sass assets/sass/noscript.scss:assets/css/noscript.css
```

For watching Sass changes during development:
```bash
sass --watch assets/sass/main.scss:assets/css/main.css
```

### Local Development Server
Since this is a static site, run a simple HTTP server:
```bash
# Python 3
python3 -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js (if http-server is installed)
npx http-server
```

## Key Features & Architecture

- **Parallax Scrolling**: Custom parallax implementation in `assets/js/main.js` using the `_parallax()` jQuery plugin
- **Responsive Design**: Breakpoints defined in JavaScript for different screen sizes (xxsmall to xlarge)
- **Scroll Effects**: Powered by Scrollex library for scroll-triggered animations
- **Navigation**: Mobile-responsive navigation with panel toggle functionality
- **Graceful Degradation**: Separate noscript.css for JavaScript-disabled browsers

## License

Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)