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
    let chartInstances = []; // Store chart instances for cleanup

    // DOM elements
    const $seniorityInput = $('#seniority-input');
    const $lookupBtn = $('#lookup-btn');
    const $loadingMessage = $('#loading-message');
    const $errorMessage = $('#error-message');
    const $resultsContainer = $('#results-container');
    const $resultsSummary = $('#results-summary');
    const $resultsContent = $('#results-content');

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
    }

    /**
     * Load pilot data from JSON file
     */
    function loadPilotData() {
        $loadingMessage.show();
        $errorMessage.hide();
        $resultsContainer.removeClass('active');

        // Check if data was loaded via script tag (fixes CORS issues on local filesystem)
        if (typeof GLOBAL_PILOT_DATA !== 'undefined') {
            pilotData = GLOBAL_PILOT_DATA;
            $loadingMessage.hide();
            console.log('Seniority Lookup: Pilot data loaded from global variable');
            return;
        }

        $.getJSON('assets/data/pilot-data.json')
            .done(function (data) {
                pilotData = data;
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

        // Find all positions for this seniority number
        const results = findPilotPositions(seniorityNum);

        if (results.length === 0) {
            showError(`No pilot found with seniority number ${seniorityNum}. Please check your number and try again.`);
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
                        isOnList: existingPilotIndex !== -1
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
        const totalCombinations = countTotalCombinations();

        // Count how many positions they're actually on vs projected
        const actualPositions = results.filter(r => r.isOnList).length;
        const projectedPositions = results.filter(r => !r.isOnList).length;

        // Update summary
        $resultsSummary.html(`
            <h2>Seniority #${seniorityNum}</h2>
            <p>Showing all ${totalCombinations} equipment/domicile combinations</p>
            <p>Currently on ${actualPositions} list${actualPositions !== 1 ? 's' : ''}, projected position shown for ${projectedPositions} other combination${projectedPositions !== 1 ? 's' : ''}</p>
            <p>Use this to compare where you are and where you would be across different aircraft and domiciles.</p>
        `);

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

        // Create charts after DOM is updated
        setTimeout(() => {
            createCharts(results);
        }, 100);

        // Show results
        $resultsContainer.addClass('active');

        // Scroll to results
        $('html, body').animate({
            scrollTop: $resultsContainer.offset().top - 100
        }, 500);
    }

    /**
     * Count total number of equipment/domicile/seat combinations
     */
    function countTotalCombinations() {
        let count = 0;
        for (const eqp in pilotData) {
            for (const dom in pilotData[eqp]) {
                // Count both CPT and FO for each combination
                if (pilotData[eqp][dom]['CPT'] && pilotData[eqp][dom]['CPT'].length > 0) {
                    count++;
                }
                if (pilotData[eqp][dom]['FO'] && pilotData[eqp][dom]['FO'].length > 0) {
                    count++;
                }
            }
        }
        return count;
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
            <div class="seat-card">
                <div class="seat-title">${seatType}</div>
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

})(jQuery);
