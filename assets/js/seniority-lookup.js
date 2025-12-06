/*
 * Seniority Lookup for CrewLu Website
 * 
 * This script handles:
 * - Loading pilot data from JSON file
 * - Looking up pilots by seniority number
 * - Calculating position, pilots above/below, and percentile
 * - Displaying results with Chart.js visualizations
 */

(function ($) {
    'use strict';

    // Global variables
    let pilotData = null;
    let validSeniorityNumbers = new Set(); // Store valid seniority numbers for O(1) lookup
    let sortedSeniorityList = []; // Sorted array for slider mapping
    let chartInstances = []; // Store chart instances for cleanup

    // DOM elements
    const $seniorityInput = $('#seniority-input');
    const $lookupBtn = $('#lookup-btn');
    const $loadingMessage = $('#loading-message');
    const $errorMessage = $('#error-message');
    const $resultsContainer = $('#results-container');
    const $resultsSummary = $('#results-summary');
    const $resultsContent = $('#results-content');
    const $seniorityProgressWrapper = $('#seniority-progress-wrapper');
    const $progressFill = $('#progress-fill');
    const $progressIcon = $('#progress-icon');
    const $stickyHeader = $('#sticky-seniority-header');
    const $stickyNumber = $('#sticky-seniority-number');

    /**
     * Initialize the seniority lookup functionality
     */
    function init() {
        // Load pilot data when page loads
        loadPilotData();

        // Set up event listeners
        setupEventListeners();
    }

    /**
     * Set up event listeners for user interactions
     */
    function setupEventListeners() {
        // Lookup button click
        $lookupBtn.on('click', function () {
            performLookup();
        });

        // Enter key in input field
        $seniorityInput.on('keypress', function (e) {
            if (e.which === 13) { // Enter key
                performLookup();
            }
        });

        // Clear error message when user starts typing
        $seniorityInput.on('input', function () {
            hideError();
        });

        // Initialize slider interaction
        setupSliderInteraction();

        // Sticky header click - scroll back to top
        $stickyHeader.on('click', function () {
            $('html, body').animate({
                scrollTop: $seniorityInput.offset().top - 200
            }, 500);
            $seniorityInput.focus();
        });
    }

    /**
     * Load pilot data from JSON file
     */
    function loadPilotData() {
        $loadingMessage.show();
        $errorMessage.hide();
        $loadingMessage.show();
        $errorMessage.hide();
        $resultsContainer.removeClass('active');
        $stickyHeader.removeClass('active');
        $seniorityProgressWrapper.removeClass('active');
        $progressFill.css('width', '0%');
        $progressIcon.css('left', '0%');

        // Check if data was loaded via script tag (fixes CORS issues on local filesystem)
        if (typeof GLOBAL_PILOT_DATA !== 'undefined') {
            processPilotData(GLOBAL_PILOT_DATA);
            $loadingMessage.hide();
            console.log('Seniority Lookup: Pilot data loaded from global variable');
            return;
        }

        $.getJSON('assets/data/pilot-data.json')
            .done(function (data) {
                processPilotData(data);
                $loadingMessage.hide();
                console.log('Pilot data loaded successfully');
            })
            .fail(function (jqXHR, textStatus, errorThrown) {
                $loadingMessage.hide();
                showError('Failed to load pilot data. Please refresh the page and try again.');
                console.error('Error loading pilot data:', textStatus, errorThrown);
            });
    }

    /**
     * Process pilot data and build lookup set
     */
    function processPilotData(data) {
        pilotData = data;
        validSeniorityNumbers.clear();

        // Iterate through all data to find all valid seniority numbers
        for (const eqp in pilotData) {
            for (const dom in pilotData[eqp]) {
                for (const seat in pilotData[eqp][dom]) {
                    const pilots = pilotData[eqp][dom][seat];
                    if (pilots && Array.isArray(pilots)) {
                        pilots.forEach(p => {
                            if (p.sen) validSeniorityNumbers.add(parseInt(p.sen, 10));
                        });
                    }
                }
            }
        }
        console.log(`Loaded ${validSeniorityNumbers.size} unique pilots.`);

        // Create sorted list for slider mapping
        sortedSeniorityList = Array.from(validSeniorityNumbers).sort((a, b) => a - b);

        // Calculate Captain Cutoff (Most Junior Captain)
        calculateCaptainCutoff();
    }

    /**
     * Calculate and display the Captain cutoff marker
     */
    function calculateCaptainCutoff() {
        let maxCaptainSeniority = 0;

        for (const eqp in pilotData) {
            for (const dom in pilotData[eqp]) {
                const captains = pilotData[eqp][dom]['CPT'];
                if (captains && captains.length > 0) {
                    // Find the junior-most captain in this list
                    // (Lists are sorted by seniority, so last item is junior-most)
                    const juniorCapt = parseInt(captains[captains.length - 1].sen, 10);
                    if (juniorCapt > maxCaptainSeniority) {
                        maxCaptainSeniority = juniorCapt;
                    }
                }
            }
        }
        console.log('Max Captain Seniority (Junior-most):', maxCaptainSeniority);

        if (maxCaptainSeniority > 0 && sortedSeniorityList.length > 0) {
            // Calculate position percentage
            // Same logic as slider:
            // 0% (Left) -> Junior (Max Seniority)
            // 100% (Right) -> Senior (Min Seniority)

            // Find index of maxCaptainSeniority (or closest match)
            // Since we want the marker at the exact spot
            const index = sortedSeniorityList.indexOf(maxCaptainSeniority);
            console.log('Captain Marker:', maxCaptainSeniority, 'Index:', index, 'Total:', sortedSeniorityList.length);

            if (index !== -1) {
                // Determine percentage
                // index 0 -> 100% (Right)
                // index Max -> 0% (Left)

                // pct = 1 - (index / (total - 1))
                const pct = 1 - (index / (sortedSeniorityList.length - 1));

                const $marker = $('#cpt-marker');
                $marker.css('left', `${pct * 100}%`);
                $marker.show();
                $marker.attr('title', `Most Junior Captain (Sen: ${maxCaptainSeniority})`);
            }
        }
    }

    /**
     * Perform lookup based on seniority number
     */
    function performLookup() {
        const seniorityNum = parseInt($seniorityInput.val().trim(), 10);

        // Validate input
        if (!seniorityNum || seniorityNum < 1 || isNaN(seniorityNum)) {
            showError('Please enter a valid seniority number (positive integer).');
            return;
        }

        // Check if data is loaded
        if (!pilotData) {
            showError('Pilot data is still loading. Please wait a moment and try again.');
            return;
        }

        // Check if seniority number exists in our data
        if (!validSeniorityNumbers.has(seniorityNum)) {
            showError('That number does not exist');
            $resultsContainer.removeClass('active');
            return;
        }

        // Find all positions for this seniority number
        const results = findPilotPositions(seniorityNum);

        if (results.length === 0) {
            // This should be caught by the check above, but as a fallback
            showError(`That number does not exist`);
            $resultsContainer.removeClass('active');
            return;
        }

        // Display results
        displayResults(results, seniorityNum);
    }

    /**
     * Find where a seniority number would be positioned on ALL equipment/domicile combinations
     * Returns array of position info objects for every combination
     */
    function findPilotPositions(seniorityNum) {
        const results = [];

        // Iterate through all equipment types
        for (const eqp in pilotData) {
            // Iterate through all domiciles
            for (const dom in pilotData[eqp]) {
                // Check both CPT and FO positions
                for (const seat of ['CPT', 'FO']) {
                    const pilots = pilotData[eqp][dom][seat];

                    if (!pilots || pilots.length === 0) {
                        continue; // Skip if no pilots on this list
                    }

                    // Find where this seniority number would be positioned
                    // Pilots are sorted by position (1-based), but we need to find by seniority
                    // Lower seniority number = higher position (more senior)

                    // First, check if pilot exists on this list
                    const existingPilotIndex = pilots.findIndex(p => p.sen === seniorityNum);

                    let position, pilotsAbove, pilotsBelow, percentile;
                    const totalPilots = pilots.length;

                    if (existingPilotIndex !== -1) {
                        // Pilot is on this list - use their actual position
                        const pilot = pilots[existingPilotIndex];
                        position = pilot.pos;
                        // Use the array index to determine relative standing
                        // pilots array is sorted by position (1 = top)
                        pilotsAbove = existingPilotIndex;
                        pilotsBelow = totalPilots - existingPilotIndex - 1;
                    } else {
                        // Pilot is NOT on this list - calculate where they would be
                        // Find insertion point: where would this seniority number fit?
                        // Lower seniority number = better position (more senior)

                        // Count how many pilots have lower (better) seniority numbers
                        pilotsAbove = pilots.filter(p => p.sen < seniorityNum).length;
                        pilotsBelow = totalPilots - pilotsAbove;

                        // Position would be pilotsAbove + 1 (1-based)
                        position = pilotsAbove + 1;
                    }

                    // Calculate percentile (higher is better - top pilots have higher percentile)
                    // Percentile = (pilotsBelow / totalPilots) * 100
                    percentile = (pilotsBelow / totalPilots) * 100;

                    // Get junior pilot's seniority for "distance to upgrade" calc
                    const juniorSeniority = pilots[pilots.length - 1].sen;

                    results.push({
                        eqp: eqp,
                        dom: dom,
                        seat: seat,
                        position: position,
                        seniority: seniorityNum,
                        totalPilots: totalPilots,
                        pilotsAbove: pilotsAbove,
                        pilotsBelow: pilotsBelow,
                        percentile: percentile,
                        isOnList: existingPilotIndex !== -1,
                        juniorSeniority: juniorSeniority
                    });
                }
            }
        }

        return results;
    }

    /**
     * Display lookup results - shows ALL equipment/domicile combinations
     */
    function displayResults(results, seniorityNum) {
        // Clear previous charts
        destroyCharts();

        // Hide error message
        hideError();

        // Create a map of results for quick lookup
        const resultsMap = {};
        for (const result of results) {
            const key = `${result.eqp}-${result.dom}-${result.seat}`;
            resultsMap[key] = result;
        }

        // Count positions found
        const positionsFound = results.length;
        const totalCombinations = results.length;

        // Identify current positions
        const currentPositions = results.filter(r => r.isOnList);

        // Generate description of current status
        let statusDescription = '';
        if (currentPositions.length > 0) {
            statusDescription = currentPositions.map(r => {
                const seatName = r.seat === 'CPT' ? 'Captain' : 'First Officer';
                return `<strong>${r.eqp} ${seatName} based in ${r.dom}</strong>`;
            }).join(', ');
        } else {
            statusDescription = 'Not currently on any list';
        }

        // Update summary
        $resultsSummary.html(`
            <h2>Seniority #${seniorityNum}: ${statusDescription}</h2>
            <p>Use this to compare where you are and where you would be across different aircraft and domiciles.</p>
        `);

        // Update sticky header
        $stickyNumber.text(seniorityNum);
        $stickyHeader.addClass('active');

        // Build HTML content - iterate through ALL equipment types and domiciles
        let html = '';

        // Custom sort order: 74Y first, then M1F, then others alphabetically
        const equipmentOrder = ['74Y', 'M1F'];
        const equipmentTypes = Object.keys(pilotData).sort((a, b) => {
            const aIndex = equipmentOrder.indexOf(a);
            const bIndex = equipmentOrder.indexOf(b);

            // If both are in the custom order, sort by their order
            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            }
            // If only 'a' is in custom order, it comes first
            if (aIndex !== -1) return -1;
            // If only 'b' is in custom order, it comes first
            if (bIndex !== -1) return 1;
            // Otherwise, sort alphabetically
            return a.localeCompare(b);
        });

        for (const eqp of equipmentTypes) {
            html += `<div class="equipment-section">`;
            html += `<h3 class="equipment-header">${eqp}</h3>`;
            html += `<div class="domicile-grid">`;

            // Get all domiciles for this equipment type
            const domiciles = Object.keys(pilotData[eqp]).sort();

            for (const dom of domiciles) {
                // Look up results for this equipment/domicile combination
                const cptKey = `${eqp}-${dom}-CPT`;
                const foKey = `${eqp}-${dom}-FO`;
                const cptResult = resultsMap[cptKey];
                const foResult = resultsMap[foKey];

                // Get total pilot counts for this domicile/equipment
                const cptTotal = pilotData[eqp][dom]['CPT'] ? pilotData[eqp][dom]['CPT'].length : 0;
                const foTotal = pilotData[eqp][dom]['FO'] ? pilotData[eqp][dom]['FO'].length : 0;

                html += `<div class="domicile-card">`;
                html += `<h4 class="domicile-header">${dom}</h4>`;
                html += `<div class="seat-comparison">`;

                // CPT Card - always show (either actual position or projected)
                if (cptResult) {
                    if (cptResult.isOnList) {
                        html += createSeatCard(cptResult, 'CPT');
                    } else {
                        html += createProjectedSeatCard(cptResult, 'CPT');
                    }
                }

                // FO Card - always show (either actual position or projected)
                if (foResult) {
                    if (foResult.isOnList) {
                        html += createSeatCard(foResult, 'FO');
                    } else {
                        html += createProjectedSeatCard(foResult, 'FO');
                    }
                }

                html += `</div>`; // seat-comparison
                html += `</div>`; // domicile-card
            }

            html += `</div>`; // domicile-grid
            html += `</div>`; // equipment-section
        }

        $resultsContent.html(html);

        // Show results
        $resultsContainer.addClass('active');

        // Scroll to results
        $('html, body').animate({
            scrollTop: $resultsContainer.offset().top - 100
        }, 500);

        // --- FUN FACTS GENERATION ---

        // 1. Calculate Global Stats
        const globalStats = calculateGlobalStats(seniorityNum);

        // 2. Generate Fun Facts
        const funFactsHTML = generateFunFacts(seniorityNum, results, globalStats);

        // 3. Inject Fun Facts
        // We'll append this to the results summary
        const $funFactsContainer = $('<div class="fun-facts-container"></div>').html(funFactsHTML);
        $resultsSummary.append($funFactsContainer);

        // Create charts after DOM is updated
        setTimeout(() => {
            createCharts(results);
        }, 100);

        // --- UPDATE PROGRESS BAR ---
        // Reuse the calculated percentile from globalStats
        // Note: globalStats.percentile is "percentile based on rank", where 100% = Top (Senior)
        // We want the bar to go from Left (Junior) to Right (Senior)
        // So 100% percentile (Senior) should be 100% width (Right)

        let progressPercent = globalStats.percentile;

        // Clamp between 0 and 100
        progressPercent = Math.max(0, Math.min(100, progressPercent));

        $seniorityProgressWrapper.addClass('active');

        // Small delay to allow fade-in before animating width
        setTimeout(() => {
            $progressFill.css('width', `${progressPercent}%`);
            $progressIcon.css('left', `${progressPercent}%`);
        }, 100);
    }

    /**
     * Calculate global pilot statistics
     * Returns: { totalPilots, myRank, percentile }
     */
    function calculateGlobalStats(mySeniority) {
        // Collect ALL unique pilots from the data
        const allPilotsSet = new Set();

        for (const eqp in pilotData) {
            for (const dom in pilotData[eqp]) {
                for (const seat in pilotData[eqp][dom]) {
                    const list = pilotData[eqp][dom][seat];
                    list.forEach(p => allPilotsSet.add(p.sen));
                }
            }
        }

        const totalPilots = allPilotsSet.size;

        // Calculate rank: how many pilots have a lower seniority number than me?
        const allPilots = Array.from(allPilotsSet);
        const pilotsSenior = allPilots.filter(sen => sen < mySeniority).length;

        const myRank = pilotsSenior + 1;
        const percentile = ((totalPilots - myRank + 1) / totalPilots) * 100;

        return {
            totalPilots: totalPilots,
            myRank: myRank,
            percentile: percentile
        };
    }

    /**
     * Generate HTML for Fun Facts
     */
    function generateFunFacts(seniorityNum, results, globalStats) {
        const facts = [];

        // Determine if pilot is a Captain (currently on any CPT list)
        const isCaptain = results.some(r => r.seat === 'CPT' && r.isOnList);

        // --- FACT 1: Captain Upgrade Potential / Status ---
        // Count lists where:
        // 1. You are already ON the list (isOnList)
        // 2. OR you are senior to at least one person on that list (pilotsBelow > 0)
        //    (This implies you could hold the line if you bid it, ignoring vacancy logic)
        const potentialCaptainLists = results.filter(r => r.seat === 'CPT' && (r.isOnList || r.pilotsBelow > 0));

        // Count total CPT combinations
        const totalCptCombinations = results.filter(r => r.seat === 'CPT').length;

        if (potentialCaptainLists.length >= totalCptCombinations && totalCptCombinations > 0) {
            facts.push({
                icon: '👨‍✈️',
                text: "Wow! You could be <strong>Captain</strong> on <strong>ANY</strong> aircraft and domicile!"
            });
        } else if (potentialCaptainLists.length > 0) {
            facts.push({
                icon: '👨‍✈️',
                text: `You could be a <strong>Captain</strong> on ${potentialCaptainLists.length} different equipment/domicile combinations!`
            });
        } else {
            facts.push({
                icon: '⏳',
                text: `Keep climbing! You're making progress towards that Captain seat.`
            });
        }

        // --- FACT 3: Best Relative Standing ---
        // Prepare Captain results
        let cptResults = results.filter(r => r.seat === 'CPT');

        // Check if we have any "reachable" Captain positions (on list or senior to someone)
        const reachableCapt = cptResults.some(r => r.isOnList || r.pilotsBelow > 0);

        if (reachableCapt) {
            // Sort by PERCENTILE (descending)
            cptResults.sort((a, b) => b.percentile - a.percentile);
        } else {
            // If NOT reachable on any list, sort by "Distance to Upgrade" (ascending)
            // Distance = seniorityNum - juniorSeniority (smaller is better/closer)
            cptResults.sort((a, b) => {
                const distA = seniorityNum - a.juniorSeniority;
                const distB = seniorityNum - b.juniorSeniority;
                return distA - distB;
            });
        }

        const foResults = results.filter(r => r.seat === 'FO').sort((a, b) => b.percentile - a.percentile);

        const bestCapt = cptResults.length > 0 ? cptResults[0] : null;
        const bestFO = foResults.length > 0 ? foResults[0] : null;

        if (isCaptain) {
            // CAPTAIN LOGIC: Only show best Captain stats
            if (bestCapt) {
                // If OFF THE LIST (position > totalPilots), show "numbers away"
                if (bestCapt.position > bestCapt.totalPilots) {
                    const diff = seniorityNum - bestCapt.juniorSeniority;
                    facts.push({
                        icon: '🔜',
                        text: `You are only <strong>${diff}</strong> numbers from a Captain upgrade on the <strong>${bestCapt.eqp}</strong> in <strong>${bestCapt.dom}</strong>.`
                    });
                } else {
                    const topPercent = (100 - bestCapt.percentile).toFixed(1);
                    facts.push({
                        icon: '🌟',
                        text: `Your best relative standing is on the <strong>${bestCapt.eqp}</strong> in <strong>${bestCapt.dom}</strong> as <strong>Captain</strong>, where you'd be in the <strong>Top ${topPercent}%</strong> (#<strong>${bestCapt.position}</strong> out of ${bestCapt.totalPilots}).`
                    });
                }
            }
        } else {
            // FO / NEW HIRE LOGIC: Show BOTH
            if (bestCapt) {
                // Captain Logic
                if (bestCapt.position > bestCapt.totalPilots) {
                    const diff = seniorityNum - bestCapt.juniorSeniority;
                    facts.push({
                        icon: '🔜',
                        text: `You are only <strong>${diff}</strong> numbers from a Captain upgrade on the <strong>${bestCapt.eqp}</strong> in <strong>${bestCapt.dom}</strong>.`
                    });
                } else {
                    const topPercent = (100 - bestCapt.percentile).toFixed(1);
                    facts.push({
                        icon: '🌟',
                        text: `Your best relative standing as <strong>Captain</strong> would be on the <strong>${bestCapt.eqp}</strong> in <strong>${bestCapt.dom}</strong>, where you'd be in the <strong>Top ${topPercent}%</strong> (#<strong>${bestCapt.position}</strong> out of ${bestCapt.totalPilots}).`
                    });
                }
            }
            if (bestFO) {
                // FO Logic
                const topPercent = (100 - bestFO.percentile).toFixed(1);
                facts.push({
                    icon: '👨‍✈️',
                    text: `Your best relative standing as <strong>First Officer</strong> is on the <strong>${bestFO.eqp}</strong> in <strong>${bestFO.dom}</strong>, where you'd be in the <strong>Top ${topPercent}%</strong> (#<strong>${bestFO.position}</strong> out of ${bestFO.totalPilots}).`
                });
            }
        }

        // Build HTML
        let html = '<div class="fun-facts-list">';
        facts.forEach(fact => {
            html += `
                <div class="fun-fact-item">
                    <span class="fun-fact-icon">${fact.icon}</span>
                    <span class="fun-fact-text">${fact.text}</span>
                </div>
            `;
        });
        html += '</div>';

        return html;
    }

    /**
     * Create HTML for a seat card showing projected position (when not currently on list)
     */
    function createProjectedSeatCard(result, seatType) {
        const percentileClass = getPercentileClass(result.percentile);
        const chartId = `chart-${result.eqp}-${result.dom}-${seatType}`;

        return `
            <div class="seat-card seat-card-projected">
                <div class="seat-title">${seatType} <span class="projected-badge">Projected</span></div>
                <div class="position-info">
                    <p><strong>Would be:</strong> Position ${result.position} of ${result.totalPilots}</p>
                    <p><strong class="${percentileClass}">Percentile:</strong> ${result.percentile.toFixed(1)}%</p>
                </div>
                <div class="percentile-chart-container">
                    <canvas id="${chartId}"></canvas>
                </div>
                <div class="pilots-count">
                    ${result.pilotsAbove} pilot${result.pilotsAbove !== 1 ? 's' : ''} above you<br>
                    ${result.pilotsBelow} pilot${result.pilotsBelow !== 1 ? 's' : ''} below you
                </div>
            </div>
        `;
    }

    /**
     * Create HTML for a seat card with position info and chart
     */
    function createSeatCard(result, seatType) {
        const percentileClass = getPercentileClass(result.percentile);
        const chartId = `chart-${result.eqp}-${result.dom}-${seatType}`;

        return `
            <div class="seat-card seat-card-current">
                <div class="seat-title">${seatType} <span class="current-badge">THIS IS YOU</span></div>
                <div class="position-info">
                    <p><strong>Position:</strong> ${result.position} of ${result.totalPilots}</p>
                    <p><strong class="${percentileClass}">Percentile:</strong> ${result.percentile.toFixed(1)}%</p>
                </div>
                <div class="percentile-chart-container">
                    <canvas id="${chartId}"></canvas>
                </div>
                <div class="pilots-count">
                    ${result.pilotsAbove} pilot${result.pilotsAbove !== 1 ? 's' : ''} above you<br>
                    ${result.pilotsBelow} pilot${result.pilotsBelow !== 1 ? 's' : ''} below you
                </div>
            </div>
        `;
    }

    /**
     * Get CSS class for percentile color coding
     */
    function getPercentileClass(percentile) {
        if (percentile >= 75) {
            return 'percentile-high';
        } else if (percentile >= 25) {
            return 'percentile-medium';
        } else {
            return 'percentile-low';
        }
    }

    /**
     * Group results by equipment type
     */
    function groupByEquipment(results) {
        const grouped = {};
        for (const result of results) {
            if (!grouped[result.eqp]) {
                grouped[result.eqp] = [];
            }
            grouped[result.eqp].push(result);
        }
        return grouped;
    }

    /**
     * Get count of unique equipment types
     */
    function getUniqueEquipmentCount(results) {
        const equipmentSet = new Set();
        for (const result of results) {
            equipmentSet.add(result.eqp);
        }
        return equipmentSet.size;
    }

    /**
     * Create Chart.js visualizations for all results with robust rendering and animation
     */
    function createCharts(results) {
        for (const result of results) {
            // Safety check: Ensure we have valid data before attempting to render
            if (!result || typeof result.percentile !== 'number') {
                console.warn('Invalid result data for chart:', result);
                continue;
            }

            const chartId = `chart-${result.eqp}-${result.dom}-${result.seat}`;
            const canvas = document.getElementById(chartId);

            if (!canvas) {
                continue;
            }

            const ctx = canvas.getContext('2d');

            // Determine chart color
            let chartColor;
            if (result.percentile >= 75) {
                chartColor = '#10b981'; // Green
            } else if (result.percentile >= 25) {
                chartColor = '#f59e0b'; // Yellow/Orange
            } else {
                chartColor = '#ef4444'; // Red
            }

            // Fixed at 0 for 12 o'clock start
            const START_ROTATION = 0;

            // Initial data - start FILLED as requested
            const initialData = [result.percentile, 100 - result.percentile];

            // Target data - the actual percentile
            const targetData = [result.percentile, 100 - result.percentile];

            const chart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: initialData,
                        backgroundColor: [chartColor, 'rgba(128, 128, 128, 0.15)'],
                        borderWidth: 0,
                        borderRadius: 4,
                        spacing: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    cutout: '75%',            // Thinner ring
                    rotation: START_ROTATION, // Start from TOP
                    circumference: 360,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    animation: {
                        animateRotate: true,
                        animateScale: false,
                        duration: 1000,
                        easing: 'easeOutQuart'
                    }
                },
                plugins: [{
                    id: 'percentileLabel',
                    afterDraw: function (chartInstance) {
                        const ctx = chartInstance.ctx;
                        const w = chartInstance.width;
                        const h = chartInstance.height;

                        ctx.save();

                        // Main Percentage Text
                        ctx.font = 'bold 24px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
                        ctx.fillStyle = chartColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';

                        // Ensure we print a valid number
                        let text = '0.0%';
                        if (!isNaN(result.percentile)) {
                            text = result.percentile.toFixed(1) + '%';
                        }

                        ctx.fillText(text, w / 2, h / 2);
                        ctx.restore();
                    }
                }]
            });

            // Hover Animation Logic
            const chartContainer = canvas.closest('.percentile-chart-container');
            if (chartContainer) {
                chartContainer.addEventListener('mouseenter', function () {
                    // Stop any ongoing animation immediately
                    chart.stop();

                    // 1. Instantly reset to 0 (empty)
                    chart.data.datasets[0].data = [0, 100];
                    chart.update('none');

                    // 2. Small delay then animate to target
                    setTimeout(() => {
                        chart.data.datasets[0].data = targetData;
                        chart.update({
                            duration: 800,
                            easing: 'easeOutQuart'
                        });
                    }, 50);
                });
            }

            chartInstances.push(chart);
        }
    }

    /**
     * Destroy all chart instances
     */
    function destroyCharts() {
        for (const chart of chartInstances) {
            chart.destroy();
        }
        chartInstances = [];
    }

    /**
     * Show error message
     */
    function showError(message) {
        $errorMessage.text(message).show();
        $resultsContainer.removeClass('active');
    }

    /**
     * Hide error message
     */
    function hideError() {
        $errorMessage.hide();
    }

    // Initialize when DOM is ready
    $(document).ready(function () {
        init();
    });

    /**
     * Set up interactive slider logic
     */
    function setupSliderInteraction() {
        const $track = $seniorityProgressWrapper.find('.progress-track');
        let isDragging = false;

        function updateSliderFromEvent(clientX) {
            const rect = $track[0].getBoundingClientRect();
            let x = clientX - rect.left;
            let pct = Math.max(0, Math.min(1, x / rect.width));

            // Update Visuals Immediate (no transition due to class)
            $progressFill.css('width', `${pct * 100}%`);
            $progressIcon.css('left', `${pct * 100}%`);

            if (sortedSeniorityList.length === 0) return;

            // Map to Seniority Number
            // 0% (Left) -> Junior (Max Seniority) -> Index: length-1
            // 100% (Right) -> Senior (Min Seniority) -> Index: 0

            // Invert pct because 0% is Junior (High Index) and 100% is Senior (Low Index)
            const index = Math.round((1 - pct) * (sortedSeniorityList.length - 1));
            const safeIndex = Math.max(0, Math.min(sortedSeniorityList.length - 1, index));

            const newSeniority = sortedSeniorityList[safeIndex];

            // Update Input
            $seniorityInput.val(newSeniority);
        }

        // Mouse Events
        $track.on('mousedown', function (e) {
            if (sortedSeniorityList.length === 0) return;
            isDragging = true;
            $track.addClass('is-dragging');
            updateSliderFromEvent(e.clientX);
            e.preventDefault(); // Prevent text selection
        });

        $(document).on('mousemove', function (e) {
            if (!isDragging) return;
            updateSliderFromEvent(e.clientX);
            e.preventDefault();
        });

        $(document).on('mouseup', function (e) {
            if (!isDragging) return;
            isDragging = false;
            $track.removeClass('is-dragging');
            // Trigger lookup
            performLookup();
        });

        // Touch Events
        $track.on('touchstart', function (e) {
            if (sortedSeniorityList.length === 0) return;
            isDragging = true;
            $track.addClass('is-dragging');
            const touch = e.originalEvent.touches[0];
            updateSliderFromEvent(touch.clientX);
            // Don't prevent default here to allow potential scrolling if not horizontal?
            // Actually, for a slider, we probably want to prevent scroll if moving horizontally.
            // But CSS touch-action: none handles this better.
        });

        $(document).on('touchmove', function (e) {
            if (!isDragging) return;
            const touch = e.originalEvent.touches[0];
            updateSliderFromEvent(touch.clientX);
        });

        $(document).on('touchend', function (e) {
            if (!isDragging) return;
            isDragging = false;
            $track.removeClass('is-dragging');
            performLookup();
        });
    }

})(jQuery);
