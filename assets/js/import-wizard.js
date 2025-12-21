/*
 * Import Wizard for CrewLu Website
 * "Flight Plan" themed interactive step-by-step import instructions
 * 
 * This wizard guides users through selecting their import configuration
 * with a beautiful, aviation-inspired interface that works seamlessly
 * on phones, tablets, and desktops.
 */

(function ($) {
    'use strict';

    // ========================================
    // Configuration & Constants
    // ========================================

    // Step display names for breadcrumbs
    const STEP_NAMES = {
        import_type: 'Import Type',
        device: 'Device',
        data_source_device: 'Data Source',
        apple_id_check: 'Apple ID',
        crewmember_type: 'Crew Type'
    };

    // ========================================
    // Difficulty Matrix
    // Maps user path choices to difficulty levels (1, 2, or 3)
    // Level 3 = red with border (hardest)
    // Level 2 = yellow with border (medium)
    // Level 1 = yellow, no border (easiest)
    // ========================================
    const DIFFICULTY_MATRIX = {
        // Device step difficulties by import_type
        device: {
            fullroster: { iphone: 3, ipad: 3, efk: 3 },
            onetrip: { iphone: 3, ipad: 3, efk: 3 },
            tripboard: { iphone: 2, ipad: 2, efk: 2 },
            altour_ticket: { iphone: 1, ipad: 1 },
            deadhead: { iphone: 3, ipad: 3, efk: 3 },
            catering: { iphone: 1, ipad: 1 }
        },
        // Data source step difficulties by import_type and device
        data_source_device: {
            fullroster: {
                iphone: { iphone: 3, ipad: 3, mac: 1, efk: 2 },
                ipad: { iphone: 3, ipad: 3, mac: 2, efk: 3 }
            },
            onetrip: {
                iphone: { iphone: 3, ipad: 3, mac: 1, efk: 2 },
                ipad: { iphone: 3, ipad: 3, mac: 2, efk: 3 }
            },
            tripboard: {
                iphone: { iphone: 1, ipad: 2, mac: 2, efk: 2 },
                ipad: { iphone: 2, ipad: 2, mac: 3, efk: 3 }
            },
            altour_ticket: {
                iphone: { iphone: 1, ipad: 1, mac: 1 },
                ipad: { iphone: 1, ipad: 1, mac: 1 }
            },
            deadhead: {
                iphone: { iphone: 3, ipad: 3, mac: 2, efk: 3 },
                ipad: { iphone: 3, ipad: 3, mac: 2, efk: 3 }
            },
            catering: {
                iphone: { iphone: 1, ipad: 1, mac: 1 },
                ipad: { iphone: 1, ipad: 1, mac: 1 }
            }
        },
        // Crewmember type step difficulties
        crewmember_type: {
            all: 2,
            individual: 1
        }
    };

    /**
     * Get the difficulty level for an option based on current context
     * Returns the difficulty level (1, 2, or 3) or null if no difficulty
     */
    function getDifficultyForOption(stepId, optionId) {
        // First step (import_type) - use difficulty from JSON data
        if (stepId === 'import_type') {
            return null; // Handled by JSON data directly
        }

        // Crewmember type step
        if (stepId === 'crewmember_type') {
            return DIFFICULTY_MATRIX.crewmember_type[optionId] || null;
        }

        // Device step - depends on import_type
        if (stepId === 'device') {
            const importType = userChoices.import_type ? userChoices.import_type.id : null;
            if (importType && DIFFICULTY_MATRIX.device[importType]) {
                return DIFFICULTY_MATRIX.device[importType][optionId] || null;
            }
            return null;
        }

        // Data source step - depends on import_type and device
        if (stepId === 'data_source_device') {
            const importType = userChoices.import_type ? userChoices.import_type.id : null;
            const device = userChoices.device ? userChoices.device.id : null;
            if (importType && device && 
                DIFFICULTY_MATRIX.data_source_device[importType] &&
                DIFFICULTY_MATRIX.data_source_device[importType][device]) {
                return DIFFICULTY_MATRIX.data_source_device[importType][device][optionId] || null;
            }
            return null;
        }

        return null;
    }

    // ========================================
    // Wizard State
    // ========================================

    let wizardData = null;           // The workflow JSON data
    let currentStep = 'import_type'; // Current step in the wizard
    let userChoices = {};            // Object storing user's selections
    let stepHistory = [];            // Array tracking navigation history

    // ========================================
    // DOM Element References
    // ========================================

    let $wizardContainer;
    let $flightPath;
    let $breadcrumbs;
    let $wizardStep;
    let $questionText;
    let $wizardOptions;
    let $instructionsArea;
    let $instructionsTitle;
    let $instructionsSummary;
    let $instructionsContent;
    let $backBtn;
    let $restartBtn;
    let $wizardNav;
    let $loadingMessage;

    // ========================================
    // Initialization
    // ========================================

    /**
     * Initialize the wizard when the DOM is ready
     * Caches DOM elements and loads the workflow data
     */
    function initWizard() {
        // Cache DOM elements for performance
        $wizardContainer = $('#import-wizard');
        $flightPath = $('#flight-path');
        $breadcrumbs = $('#choice-breadcrumbs');
        $wizardStep = $('#wizard-step');
        $questionText = $('#question-text');
        $wizardOptions = $('#wizard-options');
        $instructionsArea = $('#wizard-instructions');
        $instructionsTitle = $('#instructions-title');
        $instructionsSummary = $('#instructions-summary');
        $instructionsContent = $('#instructions-content');
        $backBtn = $('#back-btn');
        $restartBtn = $('#restart-btn');
        $wizardNav = $('#wizard-nav');
        $loadingMessage = $('#loading-message');

        // Load the workflow data from JSON file
        loadWorkflowData();

        // Set up button click handlers
        setupEventListeners();
    }

    /**
     * Fetch the workflow JSON data from the server
     * On success, starts the wizard
     * On failure, shows an error message
     */
    function loadWorkflowData() {
        $.getJSON('import-workflow.json')
            .done(function (data) {
                wizardData = data;
                $loadingMessage.hide();
                startWizard();
            })
            .fail(function () {
                $loadingMessage.html(
                    '<div class="wizard-error">' +
                    '<h3>Unable to Load</h3>' +
                    '<p>Could not load the import wizard. Please refresh the page and try again.</p>' +
                    '</div>'
                );
            });
    }

    /**
     * Set up click handlers for navigation buttons
     */
    function setupEventListeners() {
        // Back button - go to previous step
        $backBtn.on('click', function () {
            goBack();
        });

        // Restart button - start over from beginning
        $restartBtn.on('click', function () {
            restartWizard();
        });

        // Breadcrumb pills - click to edit a previous choice
        $breadcrumbs.on('click', '.choice-pill.completed', function () {
            const stepId = $(this).data('step');
            if (stepId) {
            goToStep(stepId);
            }
        });
    }

    // ========================================
    // Wizard Flow Control
    // ========================================

    /**
     * Start the wizard from the beginning
     * Resets all state and shows the first question
     */
    function startWizard() {
        currentStep = 'import_type';
        userChoices = {};
        stepHistory = [];

        // Hide elements that shouldn't show initially
        $instructionsArea.hide();
        $breadcrumbs.hide();
        $flightPath.hide();
        $restartBtn.hide();
        $backBtn.hide();
        $wizardNav.hide();

        // Show the first question
        $wizardStep.show();
        showStep(currentStep);
    }

    /**
     * Restart the wizard - reset everything and start fresh
     */
    function restartWizard() {
        // Add exit animation to current content
        $wizardStep.addClass('exiting');

        setTimeout(function () {
            $wizardStep.removeClass('exiting');
            startWizard();
        }, 300);
    }

    /**
     * Go back to the previous step
     * Removes the current choice and shows the previous question
     */
    function goBack() {
        if (stepHistory.length === 0) return;

        // Get the previous step from history
        const previousStep = stepHistory.pop();

        // Remove the choice for the step we're returning to
        // (this is the selection that moved us forward, now being undone)
        delete userChoices[previousStep];

        // Animate the transition
        $wizardStep.addClass('exiting');

        setTimeout(function () {
            $wizardStep.removeClass('exiting');
            currentStep = previousStep;
            showStep(currentStep);
            updateFlightPath();
            updateBreadcrumbs();

            // Update navigation visibility
            if (stepHistory.length === 0) {
                $backBtn.hide();
            }

            // If we're going back from instructions, show questions again
            $instructionsArea.hide();
            $wizardStep.show();
            $restartBtn.hide();
        }, 300);
    }

    /**
     * Go to a specific step (used when clicking breadcrumb pills)
     * Rebuilds history and removes choices after the target step
     */
    function goToStep(targetStep) {
        // Rebuild step history by tracing from start to target
        stepHistory = [];
        let traceStep = 'import_type';
        let safetyCounter = 0;

        // Trace through the workflow to rebuild history
        while (traceStep !== targetStep && safetyCounter < 10) {
            safetyCounter++;
            if (userChoices[traceStep]) {
                stepHistory.push(traceStep);
                const stepData = wizardData.workflow[traceStep];
                const selectedOption = stepData.options.find(opt => opt.id === userChoices[traceStep].id);
                if (selectedOption) {
                    traceStep = selectedOption.next;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        // Delete choices from target step onward
        let deleteStep = targetStep;
        safetyCounter = 0;
        while (deleteStep && deleteStep !== 'instructions' && safetyCounter < 10) {
            safetyCounter++;
            if (userChoices[deleteStep]) {
                const stepData = wizardData.workflow[deleteStep];
                const selectedOption = stepData.options.find(opt => opt.id === userChoices[deleteStep].id);
                const nextStep = selectedOption ? selectedOption.next : null;
                delete userChoices[deleteStep];
                deleteStep = nextStep;
            } else {
                break;
            }
        }

        // Animate transition to the target step
        $wizardStep.addClass('exiting');

        setTimeout(function () {
            $wizardStep.removeClass('exiting');
        currentStep = targetStep;
        showStep(currentStep);
            updateFlightPath();
            updateBreadcrumbs();

            // Show/hide navigation
        $instructionsArea.hide();
            $wizardStep.show();
        $restartBtn.hide();
            $wizardNav.show();

        if (stepHistory.length > 0) {
            $backBtn.show();
        } else {
            $backBtn.hide();
        }
        }, 300);
    }

    // ========================================
    // Step Display
    // ========================================

    /**
     * Show a specific step (question with options)
     * Filters options based on previous selections and renders cards
     */
    function showStep(stepId) {
        const stepData = wizardData.workflow[stepId];

        if (!stepData) {
            console.error('Step not found:', stepId);
            return;
        }

        // Update the question text
        $questionText.text(stepData.question);

        // Get filtered options based on user's previous choices
        let filteredOptions = getFilteredOptions(stepId, stepData.options);

        // Clear existing options
        $wizardOptions.empty();

        // Create option cards
        filteredOptions.forEach(function (option, index) {
            const $card = createOptionCard(option, stepId, index);
            $wizardOptions.append($card);
        });

        // Add click handlers to the new cards
        $('.wizard-card').on('click', function () {
            const optionId = $(this).data('option-id');
            const nextStep = $(this).data('next-step');
            const selectedLabel = $(this).find('.card-title').text();
            handleOptionSelect(optionId, selectedLabel, nextStep);
        });

        // Update navigation visibility
        $wizardNav.show();
        if (stepHistory.length > 0) {
            $backBtn.show();
        } else {
            $backBtn.hide();
        }

        // Show flight path and breadcrumbs after first selection
        if (Object.keys(userChoices).length > 0) {
            $flightPath.show();
            $breadcrumbs.show();
        }
    }

    /**
     * Create an option card element
     * Returns a jQuery element with proper structure and data attributes
     * If the option has a difficulty level (1-3), the card gets styled with colored borders and text
     * Level 3 = red border + red text, Level 2 = yellow border + yellow text, Level 1 = yellow text only
     * A "Lvl X" badge is shown in the top-right corner for all difficulty levels
     */
    function createOptionCard(option, stepId, index) {
        // Get difficulty level - either from option data (import_type step) or from matrix (other steps)
        const difficulty = option.difficulty || getDifficultyForOption(stepId, option.id);

        // Add difficulty class to card if difficulty level exists
        const difficultyClass = difficulty ? `difficulty-${difficulty}` : '';

        // Build the difficulty badge HTML if difficulty level exists
        const difficultyBadge = difficulty 
            ? `<span class="card-difficulty level-${difficulty}">Lvl ${difficulty}</span>` 
            : '';

        // Build the card HTML with difficulty styling via class and badge in top-right
        const $card = $(`
            <button class="wizard-card ${difficultyClass}" data-option-id="${option.id}" data-next-step="${option.next}">
                ${difficultyBadge}
                <div class="card-content">
                    <span class="card-title">${option.label}</span>
                </div>
                <div class="card-arrow">→</div>
            </button>
        `);

        return $card;
    }

    /**
     * Filter options based on previous user selections
     * Implements the business logic for which options should be shown
     */
    function getFilteredOptions(stepId, options) {
        let filtered = options;

        // Filter device options based on import type
        if (stepId === 'device' && userChoices.import_type) {
            const importType = userChoices.import_type.id;
            // Catering and Altour tickets can't be imported on EFK
            if (importType === 'catering' || importType === 'altour_ticket') {
                filtered = options.filter(opt => opt.id !== 'efk');
            }
        }

        // Filter data source options based on device and import type
        if (stepId === 'data_source_device') {
            const importType = userChoices.import_type ? userChoices.import_type.id : null;

            // Filter out EFK for catering and altour tickets
            if (importType === 'catering' || importType === 'altour_ticket') {
                filtered = options.filter(opt => opt.id !== 'efk');
            }

            // Filter based on selected device
            if (userChoices.device) {
                const selectedDevice = userChoices.device.id;

                // For Full Roster, One Trip, or TripBoard on iPhone/iPad
                // Allow cross-device imports (iPhone, iPad, Mac, EFK as sources)
                if ((importType === 'fullroster' || importType === 'onetrip' || importType === 'tripboard') && 
                    (selectedDevice === 'ipad' || selectedDevice === 'iphone')) {
                    filtered = options.filter(opt =>
                        opt.id === 'iphone' || opt.id === 'ipad' || opt.id === 'mac' || opt.id === 'efk'
                    );
                }
                // For EFK device, only show EFK as data source
                else if (selectedDevice === 'efk' &&
                    !(importType === 'catering' || importType === 'altour_ticket')) {
                    filtered = options.filter(opt => opt.id === 'efk');
                }
            }
        }

        return filtered;
    }

    // ========================================
    // Option Selection Handler
    // ========================================

    /**
     * Handle when user clicks an option card
     * Saves the choice, updates UI, and navigates to next step
     */
    function handleOptionSelect(optionId, optionLabel, nextStep) {
        // Save the user's choice
        userChoices[currentStep] = {
            id: optionId,
            label: optionLabel
        };

        // Add current step to history for back navigation
        stepHistory.push(currentStep);

        // Auto-skip data_source_device for EFK when importing certain types ON the EFK
        if (currentStep === 'device' && optionId === 'efk' && userChoices.import_type) {
            const importType = userChoices.import_type.id;
            if (['fullroster', 'onetrip', 'tripboard', 'deadhead'].includes(importType)) {
                nextStep = 'instructions';
            }
        }

        // Animate the transition
        $wizardStep.addClass('exiting');

        setTimeout(function () {
            $wizardStep.removeClass('exiting');

        if (nextStep === 'instructions') {
                // Show final instructions
            showInstructions();
        } else {
                // Go to next question
            currentStep = nextStep;
            showStep(currentStep);
            }

            updateFlightPath();
            updateBreadcrumbs();
        }, 300);
    }

    // ========================================
    // Flight Path Progress Indicator
    // ========================================

    /**
     * Update the flight path progress indicator
     * Shows completed waypoints, current position, and future steps
     */
    function updateFlightPath() {
        const completedSteps = stepHistory.length;
        const totalSteps = completedSteps + 1; // +1 for current step

        $flightPath.empty();

        for (let i = 0; i < totalSteps; i++) {
            // Add waypoint
            const isCompleted = i < completedSteps;
            const isCurrent = i === completedSteps;

            const $waypoint = $('<div>')
                .addClass('waypoint')
                .addClass(isCompleted ? 'completed' : '')
                .addClass(isCurrent ? 'current' : '');

            const $dot = $('<div>').addClass('waypoint-dot');
            $waypoint.append($dot);

            $flightPath.append($waypoint);

            // Add connecting segment (except after last waypoint)
            if (i < totalSteps - 1) {
                const $segment = $('<div>')
                    .addClass('flight-segment')
                    .addClass(isCompleted ? 'completed' : '');

                // Add traveling animation to the last completed segment
                if (i === completedSteps - 1) {
                    $segment.addClass('traveling');
                }

                $flightPath.append($segment);
            }
        }

        $flightPath.show();
    }

    // ========================================
    // Breadcrumb Pills
    // ========================================

    /**
     * Update the choice breadcrumbs display
     * Shows tappable pills for each completed choice
     * Uses "from" and "to" connectors for clarity
     */
    function updateBreadcrumbs() {
        $breadcrumbs.empty();

        // Add pills for each choice made
        let stepKeys = Object.keys(userChoices);

        stepKeys.forEach(function (stepId, index) {
            const choice = userChoices[stepId];

            // Create the pill (clean design without icons)
            const $pill = $(`
                <button class="choice-pill completed" data-step="${stepId}">
                    <span class="pill-label">${choice.label}</span>
                </button>
            `);

            $breadcrumbs.append($pill);

            // Add connector text between pills (except after last)
            // First connector: "to the CrewLu app on" (what → to destination)
            // Second connector: "from" (destination → from source)
            // Any additional: "→"
            if (index < stepKeys.length - 1) {
                let connectorText = '→';
                if (index === 0) {
                    connectorText = 'to the <strong class="connector-brand">CrewLu</strong> app on';
                } else if (index === 1) {
                    connectorText = 'from';
                }
                $breadcrumbs.append(`<span class="breadcrumb-connector">${connectorText}</span>`);
            }
        });

        // Show breadcrumbs if there are choices
        if (stepKeys.length > 0) {
            $breadcrumbs.show();
        } else {
            $breadcrumbs.hide();
        }
    }

    // ========================================
    // Instructions Display
    // ========================================

    /**
     * Show the final instructions based on user's choices
     * Generates the instruction key and renders the timeline
     */
    function showInstructions() {
        const instructionKey = generateInstructionKey();
        const instructions = wizardData.instructions[instructionKey];

        // Hide question area, show instructions area
        $wizardStep.hide();
        $instructionsArea.show();

        if (!instructions) {
            // Show error if no instructions found for this combination
            $instructionsTitle.text('Instructions Not Available');
            $instructionsSummary.html(
                '<p>We don\'t have specific instructions for this combination yet. ' +
                'Please try a different configuration or contact support.</p>'
            );
            $instructionsContent.html(
                '<div class="wizard-error">' +
                '<p><strong>Your selections:</strong></p>' +
                '<ul>' +
                Object.keys(userChoices).map(step =>
                    `<li>${STEP_NAMES[step] || step}: ${userChoices[step].label}</li>`
                ).join('') +
                '</ul>' +
                '</div>'
            );
        } else {
            // Render instructions
            $instructionsTitle.text(instructions.title);

            // Add summary if available
            if (instructions.summary) {
                $instructionsSummary.html(`<p>${convertUrlsToLinks(instructions.summary)}</p>`);
            } else {
                $instructionsSummary.empty();
            }

            // Build timeline HTML
            let timelineHtml = '';

            instructions.steps.forEach(function (step, index) {
                timelineHtml += `
                    <div class="timeline-step" data-step="${index + 1}" style="--step-index: ${index}">
                        <div class="step-content">
                            <p>${convertUrlsToLinks(step.text)}</p>
                            ${renderStepMedia(step.media)}
                                </div>
                                </div>
                            `;
            });

            $instructionsContent.html(timelineHtml);
        }

        // Show navigation buttons
        $wizardNav.show();
        $backBtn.show();
        $restartBtn.show();

        // Update flight path to show completion
        updateFlightPath();
    }

    /**
     * Render media (images/videos) for an instruction step
     */
    function renderStepMedia(media) {
        if (!media) return '';

        const mediaItems = Array.isArray(media) ? media : [media];
        let html = '';

        mediaItems.forEach(function (item) {
            const path = (item.file.startsWith('../') || item.file.startsWith('images/'))
                ? item.file
                : `import-guide-media/${item.file}`;
            const caption = item.caption || '';

            if (item.type === 'video') {
                html += `
                    <div class="step-image">
                        <video controls>
                            <source src="${path}" type="video/mp4">
                            Your browser does not support video.
                        </video>
                    </div>
                    ${caption ? `<p class="step-caption">${caption}</p>` : ''}
                `;
            } else {
                html += `
                    <div class="step-image">
                        <img src="${path}" alt="${caption}" loading="lazy" />
                    </div>
                    ${caption ? `<p class="step-caption">${caption}</p>` : ''}
                `;
            }
        });

        return html;
    }

    /**
     * Generate the instruction key based on user choices
     * This key is used to look up the correct instructions in the JSON
     */
    function generateInstructionKey() {
        let key = '';

        if (userChoices.import_type) {
            key += userChoices.import_type.id;
        }

        // Special handling for crewmembers - use crewmember_type
        if (userChoices.import_type && userChoices.import_type.id === 'crewmembers' && userChoices.crewmember_type) {
            key += '-' + userChoices.crewmember_type.id;
            return key;
        }

        // For EFK device, use simplified key
        if (userChoices.device && userChoices.device.id === 'efk' && userChoices.import_type) {
            const importType = userChoices.import_type.id;
            if (['fullroster', 'onetrip', 'tripboard', 'deadhead'].includes(importType)) {
                return key + '-efk';
            }
        }

        if (userChoices.device) {
            key += '-' + userChoices.device.id;
        }

        if (userChoices.data_source_device) {
            key += '-' + userChoices.data_source_device.id;
        }

        // Add Apple ID check if pulling from EFK
        if (userChoices.data_source_device && userChoices.data_source_device.id === 'efk') {
            key += '-' + (userChoices.apple_id_check ? userChoices.apple_id_check.id : 'no');
        } else if (userChoices.apple_id_check) {
            key += '-' + userChoices.apple_id_check.id;
        }

        return key;
    }

    // ========================================
    // Utility Functions
    // ========================================

    /**
     * Convert URLs in text to clickable links
     * Special handling for iCloud shortcuts links
     */
    function convertUrlsToLinks(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        return text.replace(urlRegex, function (url) {
            let linkText = url;

            // Use friendly names for known iCloud shortcuts
            if (url.includes('icloud.com/shortcuts')) {
                if (url.includes('1c4eea69ff5e4130b05eb8d6ac28f99d')) {
                    linkText = 'Clipboard Shortcut Link';
                } else {
                    linkText = 'Airdrop Shortcut Link';
                }
            }

            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
        });
    }

    // ========================================
    // Initialize on Document Ready
    // ========================================

    $(document).ready(function () {
        initWizard();
    });

})(jQuery);
