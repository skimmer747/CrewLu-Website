/*
 * Import Wizard for CrewLu Website
 * Provides interactive step-by-step import instructions
 */

(function($) {
    'use strict';

    // Wizard state
    let wizardData = null;
    let currentStep = 'device';
    let userChoices = {};
    let stepHistory = [];

    // DOM elements
    let $wizardContainer;
    let $questionText;
    let $wizardOptions;
    let $instructionsArea;
    let $instructionsTitle;
    let $instructionsContent;
    let $summaryArea;
    let $summaryText;
    let $backBtn;
    let $restartBtn;
    let $loadingMessage;
    let $progressIndicator;

    // Initialize the wizard
    function initWizard() {
        // Cache DOM elements
        $wizardContainer = $('#import-wizard');
        $questionText = $('#question-text');
        $wizardOptions = $('#wizard-options');
        $instructionsArea = $('#wizard-instructions');
        $instructionsTitle = $('#instructions-title');
        $instructionsContent = $('#instructions-content');
        $summaryArea = $('#wizard-summary');
        $summaryText = $('#summary-text');
        $backBtn = $('#back-btn');
        $restartBtn = $('#restart-btn');
        $loadingMessage = $('#loading-message');
        $progressIndicator = $('#wizard-progress');

        // Load workflow data
        loadWorkflowData();

        // Set up event listeners
        setupEventListeners();
    }

    // Load the workflow JSON data
    function loadWorkflowData() {
        $.getJSON('import-workflow.json')
            .done(function(data) {
                wizardData = data;
                $loadingMessage.hide();
                startWizard();
            })
            .fail(function() {
                $loadingMessage.html('<div class="box error"><p><strong>Error:</strong> Could not load the import wizard. Please refresh the page and try again.</p></div>');
            });
    }

    // Set up event listeners
    function setupEventListeners() {
        // Back button
        $backBtn.on('click', function() {
            goBack();
        });

        // Restart button
        $restartBtn.on('click', function() {
            restartWizard();
        });

        // Summary text clicks (for editing previous choices)
        $summaryText.on('click', '.editable-choice', function() {
            const stepId = $(this).data('step');
            goToStep(stepId);
        });
    }

    // Start the wizard
    function startWizard() {
        currentStep = 'device';
        userChoices = {};
        stepHistory = [];
        showStep(currentStep);
        updateProgressIndicator();
    }

    // Restart the wizard
    function restartWizard() {
        startWizard();
        $instructionsArea.hide();
        $summaryArea.hide();
        $restartBtn.hide();
        $backBtn.hide();
    }

    // Go back to previous step
    function goBack() {
        if (stepHistory.length > 0) {
            const previousStep = stepHistory.pop();

            // Remove the choice for current step
            const stepData = wizardData.workflow[currentStep];
            if (stepData) {
                delete userChoices[currentStep];
            }

            currentStep = previousStep;
            showStep(currentStep);
            updateProgressIndicator();
            updateSummary();

            if (stepHistory.length === 0) {
                $backBtn.hide();
            }

            // Hide instructions if we're back to questions
            $instructionsArea.hide();
            $restartBtn.hide();
        }
    }

    // Go to a specific step (used for editing choices)
    function goToStep(targetStep) {
        // Clear choices from target step onward
        const stepOrder = ['device', 'source', 'efk_type'];
        const targetIndex = stepOrder.indexOf(targetStep);

        for (let i = targetIndex; i < stepOrder.length; i++) {
            delete userChoices[stepOrder[i]];
        }

        // Rebuild step history up to target
        stepHistory = stepOrder.slice(0, targetIndex);
        currentStep = targetStep;

        showStep(currentStep);
        updateProgressIndicator();
        updateSummary();

        // Hide instructions and show questions again
        $instructionsArea.hide();
        $restartBtn.hide();

        if (stepHistory.length > 0) {
            $backBtn.show();
        } else {
            $backBtn.hide();
        }
    }

    // Show a specific step
    function showStep(stepId) {
        const stepData = wizardData.workflow[stepId];

        if (!stepData) {
            console.error('Step not found:', stepId);
            return;
        }

        // Update question text
        $questionText.text(stepData.question);

        // Clear and populate options
        $wizardOptions.empty();

        stepData.options.forEach(function(option) {
            const $optionBtn = $('<button>')
                .addClass('button option-btn')
                .text(option.label)
                .data('option-id', option.id)
                .data('next-step', option.next);

            $wizardOptions.append($optionBtn);
        });

        // Add click handlers for option buttons
        $('.option-btn').on('click', function() {
            const optionId = $(this).data('option-id');
            const nextStep = $(this).data('next-step');
            const selectedLabel = $(this).text();

            handleOptionSelect(optionId, selectedLabel, nextStep);
        });

        // Show/hide back button
        if (stepHistory.length > 0) {
            $backBtn.show();
        } else {
            $backBtn.hide();
        }
    }

    // Handle option selection
    function handleOptionSelect(optionId, optionLabel, nextStep) {
        // Save the choice
        userChoices[currentStep] = {
            id: optionId,
            label: optionLabel
        };

        // Add current step to history
        stepHistory.push(currentStep);

        if (nextStep === 'instructions') {
            // Show instructions
            showInstructions();
        } else {
            // Go to next step
            currentStep = nextStep;
            showStep(currentStep);
            updateProgressIndicator();
        }

        updateSummary();
    }

    // Show final instructions
    function showInstructions() {
        const instructionKey = generateInstructionKey();
        const instructions = wizardData.instructions[instructionKey];

        if (!instructions) {
            // Fallback if exact match not found
            $instructionsContent.html(
                '<div class="box error">' +
                '<h3>Instructions Not Available</h3>' +
                '<p>We don\'t have specific instructions for this combination yet. Please check back later or contact support.</p>' +
                '<p><strong>Your selections:</strong></p>' +
                '<ul>' +
                Object.keys(userChoices).map(step =>
                    `<li><strong>${step}:</strong> ${userChoices[step].label}</li>`
                ).join('') +
                '</ul>' +
                '</div>'
            );
        } else {
            // Build instructions HTML
            let instructionsHtml = '';

            instructions.steps.forEach(function(step, index) {
                instructionsHtml += '<div class="instruction-step">';
                instructionsHtml += `<h3>Step ${index + 1}</h3>`;
                instructionsHtml += `<p>${step.text}</p>`;

                if (step.media) {
                    const mediaPath = `import-guide-media/${step.media.file}`;
                    const caption = step.media.caption || '';

                    if (step.media.type === 'video') {
                        instructionsHtml += `
                            <div class="media-container">
                                <video controls>
                                    <source src="${mediaPath}" type="video/mp4">
                                    Your browser does not support the video tag.
                                </video>
                                ${caption ? `<p class="media-caption">${caption}</p>` : ''}
                            </div>
                        `;
                    } else {
                        instructionsHtml += `
                            <div class="media-container">
                                <img src="${mediaPath}" alt="${caption}" class="instruction-image" />
                                ${caption ? `<p class="media-caption">${caption}</p>` : ''}
                            </div>
                        `;
                    }
                }

                instructionsHtml += '</div>';

                if (index < instructions.steps.length - 1) {
                    instructionsHtml += '<hr class="step-divider">';
                }
            });

            $instructionsContent.html(instructionsHtml);
            $instructionsTitle.text(instructions.title);
        }

        // Show instructions area and hide question area
        $instructionsArea.show();
        $('#wizard-question').hide();
        $restartBtn.show();
        $backBtn.show();
        updateProgressIndicator(true);
    }

    // Generate instruction key based on user choices
    function generateInstructionKey() {
        let key = '';

        if (userChoices.device) {
            key += userChoices.device.id;
        }

        if (userChoices.efk_type) {
            key += '-' + userChoices.efk_type.id;
        }

        if (userChoices.source) {
            key += '-' + userChoices.source.id;
        }

        return key;
    }

    // Update the summary sentence
    function updateSummary() {
        if (Object.keys(userChoices).length === 0) {
            $summaryArea.hide();
            return;
        }

        let summaryText = 'These instructions are for importing data into CrewLu';

        if (userChoices.device) {
            summaryText += ` on <span class="editable-choice" data-step="device">${userChoices.device.label}</span>`;
        }

        if (userChoices.efk_type) {
            summaryText += ` (specifically your <span class="editable-choice" data-step="efk_type">${userChoices.efk_type.label}</span>)`;
        }

        if (userChoices.source) {
            summaryText += ` from <span class="editable-choice" data-step="source">${userChoices.source.label}</span>`;
        }

        summaryText += '.';

        $summaryText.html(summaryText);
        $summaryArea.show();
    }

    // Update progress indicator
    function updateProgressIndicator(completed = false) {
        $progressIndicator.show();

        // Simple 3-step progress
        const stepMap = {
            'device': 1,
            'efk_type': 2,
            'source': 2,
            'instructions': 3
        };

        const currentStepNum = completed ? 3 : (stepMap[currentStep] || 1);

        for (let i = 1; i <= 3; i++) {
            const $step = $(`#step-${i}`);
            if (i <= currentStepNum) {
                $step.addClass('active');
            } else {
                $step.removeClass('active');
            }

            if (completed && i === 3) {
                $step.addClass('completed');
            }
        }
    }

    // Initialize when document is ready
    $(document).ready(function() {
        initWizard();
    });

})(jQuery);