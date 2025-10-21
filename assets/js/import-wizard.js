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

    // Convert URLs in text to clickable links
    function convertUrlsToLinks(text) {
        // Regular expression to match URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        return text.replace(urlRegex, function(url) {
            // Check if it's an iCloud shortcuts URL and use descriptive text
            let linkText = url;
            if (url.includes('icloud.com/shortcuts')) {
                // Check for the new clipboard shortcut
                if (url.includes('1c4eea69ff5e4130b05eb8d6ac28f99d')) {
                    linkText = 'Clipboard Shortcut Link';
                } else {
                    linkText = 'Airdrop Shortcut Link';
                }
            }
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
        });
    }

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
        currentStep = 'import_type';
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
            $('#wizard-question').show();
            $restartBtn.hide();
        }
    }

    // Go to a specific step (used for editing choices)
    function goToStep(targetStep) {
        // Rebuild step history by tracing through the workflow from the beginning
        // up to (but not including) the target step
        stepHistory = [];
        let traceStep = 'import_type';
        
        while (traceStep !== targetStep && stepHistory.length < 10) {
            if (userChoices[traceStep]) {
                stepHistory.push(traceStep);
                
                // Find next step based on this choice
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
        
        // Now delete the target step choice and all choices after it
        // Trace from target step forward and delete everything
        let deleteStep = targetStep;
        let safetyCounter = 0;
        
        while (deleteStep && deleteStep !== 'instructions' && safetyCounter < 10) {
            safetyCounter++;
            
            if (userChoices[deleteStep]) {
                // Find what the next step would be before we delete this choice
                const stepData = wizardData.workflow[deleteStep];
                const selectedOption = stepData.options.find(opt => opt.id === userChoices[deleteStep].id);
                const nextStep = selectedOption ? selectedOption.next : null;
                
                // Delete this step's choice
                delete userChoices[deleteStep];
                
                // Move to next step
                deleteStep = nextStep;
            } else {
                break;
            }
        }
        
        currentStep = targetStep;

        showStep(currentStep);
        updateProgressIndicator();
        updateSummary();

        // Hide instructions and show questions again
        $instructionsArea.hide();
        $('#wizard-question').show();
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

        // Filter options based on previous selections for logical flow
        let filteredOptions = stepData.options;

        if (stepId === 'device' && userChoices.import_type) {
            const importType = userChoices.import_type.id;

            // When importing catering or altour tickets, don't show EFK as a device option
            if (importType === 'catering' || importType === 'altour_ticket') {
                filteredOptions = stepData.options.filter(function(option) {
                    return option.id !== 'efk';
                });
            }
        }

        if (stepId === 'data_source_device') {
            // Filter based on import type
            if (userChoices.import_type && (userChoices.import_type.id === 'catering' || userChoices.import_type.id === 'altour_ticket')) {
                // When importing catering or altour tickets, don't show EFK as a data source option
                filteredOptions = stepData.options.filter(function(option) {
                    return option.id !== 'efk';
                });
            }

            // Filter based on selected device
            if (userChoices.device) {
                const selectedDevice = userChoices.device.id;
                const importType = userChoices.import_type ? userChoices.import_type.id : null;

                // Special handling for Full Roster or One Trip on personal iPad
                if ((importType === 'fullroster' || importType === 'onetrip') && selectedDevice === 'ipad') {
                    // Only show personal iPad, Mac, and EFK as data source options
                    filteredOptions = stepData.options.filter(function(option) {
                        return option.id === 'ipad' || option.id === 'mac' || option.id === 'efk';
                    });
                }
                // Special handling for Full Roster or One Trip on iPhone
                else if ((importType === 'fullroster' || importType === 'onetrip') && selectedDevice === 'iphone') {
                    // Only show iPhone, Mac, and EFK as data source options
                    filteredOptions = stepData.options.filter(function(option) {
                        return option.id === 'iphone' || option.id === 'mac' || option.id === 'efk';
                    });
                }
                // Special handling for catering and altour_ticket imports - they can use all mobile/computer devices
                else if (importType === 'catering' || importType === 'altour_ticket') {
                    // Already filtered out EFK above, no additional filtering needed
                } else {
                    // For other import types, when importing to EFK, only show EFK as data source
                    if (selectedDevice === 'efk') {
                        filteredOptions = stepData.options.filter(function(option) {
                            return option.id === 'efk';
                        });
                    }
                }
            }
        }

        filteredOptions.forEach(function(option) {
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

        // Auto-skip data_source_device step for EFK when importing Full Roster, One Trip, or Jumpseat ON the EFK device
        if (currentStep === 'device' && optionId === 'efk' && userChoices.import_type) {
            const importType = userChoices.import_type.id;
            if (importType === 'fullroster' || importType === 'onetrip' || importType === 'deadhead') {
                // Skip directly to instructions for EFK device installations
                nextStep = 'instructions';
            }
        }



        // (Removed) Auto-skip for Full Roster on iPhone/iPad — users must choose data source device

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

            // Add summary if it exists
            if (instructions.summary) {
                instructionsHtml += '<div class="instruction-summary">';
                instructionsHtml += `<p>${convertUrlsToLinks(instructions.summary)}</p>`;
                instructionsHtml += '</div><hr class="summary-divider">';
            }

            instructions.steps.forEach(function(step, index) {
                instructionsHtml += '<div class="instruction-step">';
                instructionsHtml += `<h3>Step ${index + 1}</h3>`;
                instructionsHtml += `<p>${convertUrlsToLinks(step.text)}</p>`;

                // Handle media - can be single object or array of objects
                if (step.media) {
                    const mediaItems = Array.isArray(step.media) ? step.media : [step.media];

                    mediaItems.forEach(function(media, mediaIndex) {
                        const mediaPath = (media.file.startsWith('../') || media.file.startsWith('images/')) ? media.file : `import-guide-media/${media.file}`;
                        const caption = media.caption || '';

                        if (media.type === 'video') {
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
                    });
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

        if (userChoices.import_type) {
            key += userChoices.import_type.id;
        }

        // For crewmembers, use the crewmember_type instead of device flow
        if (userChoices.import_type && userChoices.import_type.id === 'crewmembers' && userChoices.crewmember_type) {
            key += '-' + userChoices.crewmember_type.id;
            return key;
        }

        // For EFK device installations of fullroster, onetrip, or deadhead, use simplified key
        if (userChoices.device && userChoices.device.id === 'efk' && userChoices.import_type) {
            const importType = userChoices.import_type.id;
            if (importType === 'fullroster' || importType === 'onetrip' || importType === 'deadhead') {
                // Return simplified key: importType-efk
                return key + '-efk';
            }
        }

        if (userChoices.device) {
            key += '-' + userChoices.device.id;
        }

        if (userChoices.data_source_device) {
            key += '-' + userChoices.data_source_device.id;
        }

        // If pulling from EFK and no apple_id_check was asked, default to '-no'
        if (userChoices.data_source_device && userChoices.data_source_device.id === 'efk') {
            key += '-' + (userChoices.apple_id_check ? userChoices.apple_id_check.id : 'no');
        } else if (userChoices.apple_id_check) {
            key += '-' + userChoices.apple_id_check.id;
        }

        return key;
    }

    // Update the summary sentence
    function updateSummary() {
        if (Object.keys(userChoices).length === 0) {
            $summaryArea.hide();
            return;
        }

        let summaryText = 'These instructions are for importing';

        if (userChoices.import_type) {
            summaryText += ` <span class="editable-choice" data-step="import_type">${userChoices.import_type.label}</span>`;
        }

        // For crewmembers, show the type selection
        if (userChoices.import_type && userChoices.import_type.id === 'crewmembers' && userChoices.crewmember_type) {
            summaryText += ` (<span class="editable-choice" data-step="crewmember_type">${userChoices.crewmember_type.label}</span>)`;
        }

        summaryText += ' data into CrewLu';

        if (userChoices.device) {
            summaryText += ` on <span class="editable-choice" data-step="device">${userChoices.device.label}</span>`;
        }

        if (userChoices.data_source_device) {
            summaryText += ` from <span class="editable-choice" data-step="data_source_device">${userChoices.data_source_device.label}</span>`;
        }

        if (userChoices.apple_id_check) {
            const appleIdStatus = userChoices.apple_id_check.id === 'yes' ? 'using the same Apple ID' : 'using different Apple IDs';
            summaryText += ` (${appleIdStatus})`;
        }

        summaryText += '.';

        $summaryText.html(summaryText);
        $summaryArea.show();
    }

    // Update progress indicator with progressive reveal
    function updateProgressIndicator(completed = false) {
        // Number of steps to show:
        // - When answering questions: show completed steps + current unfilled step
        // - When at instructions (completed): show only the completed steps with checkmark on last
        const totalStepsToShow = completed ? stepHistory.length : (stepHistory.length + 1);

        // Get the container
        const $progressStepsContainer = $('#progress-steps');
        
        // Regenerate step circles if count changed
        const existingStepCount = $progressStepsContainer.children('.step').length;
        if (existingStepCount !== totalStepsToShow) {
            $progressStepsContainer.empty();
            for (let i = 1; i <= totalStepsToShow; i++) {
                const $stepCircle = $('<span>')
                    .addClass('step')
                    .attr('id', `step-${i}`)
                    .text(i);
                $progressStepsContainer.append($stepCircle);
            }
        }

        // Update states for all steps
        for (let i = 1; i <= totalStepsToShow; i++) {
            const $step = $(`#step-${i}`);
            
            // Clean up all state classes first
            $step.removeClass('active completed');

            if (completed && i === totalStepsToShow) {
                // Final step gets checkmark when at instructions
                $step.addClass('completed');
            } else if (i <= stepHistory.length) {
                // Completed steps are filled/active
                $step.addClass('active');
            }
            // Current step (stepHistory.length + 1) remains unfilled when not completed
        }

        $progressIndicator.show();
    }

    // Initialize when document is ready
    $(document).ready(function() {
        initWizard();
    });

})(jQuery);