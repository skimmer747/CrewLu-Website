(function ($) {
	'use strict';

	// --- Parsing ---

	function parseBidData(rawText) {
		var lines = rawText.split('\n');
		var pilots = [];
		var currentPilot = null;
		var currentBidType = 'SCHEDULE';

		for (var i = 0; i < lines.length; i++) {
			var line = lines[i];

			// Skip empty lines
			if ($.trim(line) === '') continue;

			// Detect bid type section headers before filtering headers
			var trimmedLine = $.trim(line);
			if (/SHORT\s+TERM\s+TRAINING\s+BIDS/i.test(trimmedLine)) {
				currentBidType = 'SHORT TERM TRAINING';
			} else if (/LONG\s+TERM\s+TRAINING\s+BIDS/i.test(trimmedLine)) {
				currentBidType = 'LONG TERM TRAINING';
			} else if (/SCHEDULE\s+BIDS/i.test(trimmedLine) && !/TRAINING/i.test(trimmedLine)) {
				currentBidType = 'SCHEDULE';
			}

			// Skip header/page-break lines
			if (isHeaderLine(line)) continue;

			// Check if this is a continuation line (30+ leading spaces, numbers only)
			var continuationMatch = line.match(/^(\s{28,})([\d\s]+)$/);
			if (continuationMatch && currentPilot) {
				var moreBids = parseBidNumbers(continuationMatch[2]);
				currentPilot.bids = currentPilot.bids.concat(moreBids);
				continue;
			}

			// Try to match a pilot record line
			var pilotMatch = line.match(/^\s*(.+?)\s{2,}(\d+)\s+(\d+)\s+([A-Z]{3,4})\s+(\w{2,3})\s+(CPT|F\/O)\s+([\d\s]*)$/);
			if (pilotMatch) {
				currentPilot = {
					name: $.trim(pilotMatch[1]),
					id: pilotMatch[2],
					sen: parseInt(pilotMatch[3], 10),
					base: pilotMatch[4],
					eqp: pilotMatch[5],
					sta: pilotMatch[6],
					bids: parseBidNumbers(pilotMatch[7]),
					bidType: currentBidType
				};
				pilots.push(currentPilot);
				continue;
			}
		}

		return pilots;
	}

	function isHeaderLine(line) {
		var trimmed = $.trim(line);
		if (trimmed.indexOf('ONLY PILOTS WITH BIDS ON FILE') !== -1) return true;
		if (trimmed.indexOf('SCHEDPST') !== -1) return true;
		if (/^NAME\s+ID#\s+SEN/.test(trimmed)) return true;
		if (/^Page\s+\d+/.test(trimmed)) return true;
		if (/SCHEDULE BIDS\s+Page/.test(trimmed)) return true;
		if (/TRAINING BIDS\s+Page/.test(trimmed)) return true;
		if (/TRAINING BIDS\s*$/.test(trimmed)) return true;
		if (/SCHEDULE BIDS\s*$/.test(trimmed)) return true;
		return false;
	}

	function parseBidNumbers(str) {
		var trimmed = $.trim(str);
		if (!trimmed) return [];
		var parts = trimmed.split(/\s+/);
		var nums = [];
		for (var i = 0; i < parts.length; i++) {
			var n = parseInt(parts[i], 10);
			if (!isNaN(n)) nums.push(n);
		}
		return nums;
	}

	// --- Grouping ---

	function groupPilots(pilots) {
		var groups = {};
		for (var i = 0; i < pilots.length; i++) {
			var p = pilots[i];
			var key = p.bidType + '|' + p.base + '-' + p.eqp + '-' + p.sta;
			if (!groups[key]) groups[key] = [];
			groups[key].push(p);
		}
		return groups;
	}

	// --- Award Algorithm ---

	function calculateAwards(pilotsInGroup) {
		// Sort by seniority number ascending (lower = more senior)
		var sorted = pilotsInGroup.slice().sort(function (a, b) {
			return a.sen - b.sen;
		});

		var awardedLines = {};  // line number -> true (already taken)
		var results = [];

		for (var i = 0; i < sorted.length; i++) {
			var pilot = sorted[i];
			var awarded = null;
			var choiceNum = null;

			for (var j = 0; j < pilot.bids.length; j++) {
				var bid = pilot.bids[j];
				if (!awardedLines[bid]) {
					awarded = bid;
					choiceNum = j + 1;
					awardedLines[bid] = true;
					break;
				}
			}

			results.push({
				name: pilot.name,
				id: pilot.id,
				sen: pilot.sen,
				base: pilot.base,
				eqp: pilot.eqp,
				sta: pilot.sta,
				bidType: pilot.bidType,
				awardedLine: awarded,
				choiceNumber: choiceNum,
				totalBids: pilot.bids.length
			});
		}

		return results;
	}

	// --- Crew Pairing ---

	function findCrewPartner(userResult, groups, allGroupResults) {
		if (!userResult || userResult.awardedLine === null) return null;

		var oppositeSta = (userResult.sta === 'CPT') ? 'F/O' : 'CPT';
		var oppositeKey = userResult.bidType + '|' + userResult.base + '-' + userResult.eqp + '-' + oppositeSta;

		// Calculate awards for opposite group if not already done
		if (!allGroupResults[oppositeKey] && groups[oppositeKey]) {
			allGroupResults[oppositeKey] = calculateAwards(groups[oppositeKey]);
		}

		var oppositeResults = allGroupResults[oppositeKey];
		if (!oppositeResults) return null;

		for (var i = 0; i < oppositeResults.length; i++) {
			if (oppositeResults[i].awardedLine === userResult.awardedLine) {
				return oppositeResults[i];
			}
		}

		return null;
	}

	// --- Display ---

	function getChoiceClass(choiceNum) {
		if (choiceNum === null) return 'choice-none';
		if (choiceNum === 1) return 'choice-1';
		if (choiceNum <= 3) return 'choice-2';
		return 'choice-4plus';
	}

	function getChoiceLabel(choiceNum) {
		if (choiceNum === null) return 'No Award';
		var suffix = 'th';
		if (choiceNum === 1) suffix = 'st';
		else if (choiceNum === 2) suffix = 'nd';
		else if (choiceNum === 3) suffix = 'rd';
		return choiceNum + suffix + ' choice';
	}

	function getBidTypeLabel(bidType) {
		if (bidType === 'SHORT TERM TRAINING') return 'Short Term Training';
		if (bidType === 'LONG TERM TRAINING') return 'Long Term Training';
		return 'Schedule';
	}

	function formatGroupLabel(groupKey) {
		// groupKey format: "BIDTYPE|BASE-EQP-STA"
		var pipeIdx = groupKey.indexOf('|');
		var seatPart = groupKey.substring(pipeIdx + 1);
		var parts = seatPart.split('-');
		return parts[1] + ' ' + parts[2] + ' - ' + parts[0];
	}

	function displayResults(userGroupData, userId, showBidTypeLabels) {
		var $summary = $('#award-summary');
		var $tableContainer = $('#group-table-container');
		$summary.empty();
		$tableContainer.empty();

		if (userGroupData.length === 0) {
			$summary.html(
				'<div class="award-summary no-award">' +
				'<h2>Employee ID Not Found</h2>' +
				'<p class="award-detail">ID "' + escapeHtml(userId) + '" was not found in the parsed bid data.</p>' +
				'<p class="award-detail">Make sure you entered the correct Employee ID and pasted the complete bid data.</p>' +
				'</div>'
			);
			return;
		}

		var summaryHtml = '';
		var tableHtml = '';

		for (var g = 0; g < userGroupData.length; g++) {
			var data = userGroupData[g];
			var results = data.results;
			var groupKey = data.groupKey;
			var partner = data.partner;

			var userResult = null;
			for (var i = 0; i < results.length; i++) {
				if (results[i].id === userId) {
					userResult = results[i];
					break;
				}
			}

			if (!userResult) continue;

			var groupLabel = formatGroupLabel(groupKey);
			var bidTypeLabel = getBidTypeLabel(userResult.bidType);
			var titlePrefix = showBidTypeLabels ? (bidTypeLabel + ' - ') : '';

			// Build summary card
			var partnerHtml = '';
			if (partner) {
				partnerHtml = '<p class="award-partner">Flying with: ' +
					escapeHtml(partner.name) + ' (Sen #' + partner.sen + ')</p>';
			}

			if (userResult.awardedLine !== null) {
				summaryHtml +=
					'<div class="award-summary">' +
					'<h2>' + titlePrefix + 'Your Award</h2>' +
					'<div class="award-line">Line ' + userResult.awardedLine + '</div>' +
					'<p class="award-detail"><span class="' + getChoiceClass(userResult.choiceNumber) + '">' +
					getChoiceLabel(userResult.choiceNumber) + '</span> out of ' + userResult.totalBids + ' bid(s)</p>' +
					partnerHtml +
					'<p class="award-group">' + groupLabel + ' | Seniority #' + userResult.sen + '</p>' +
					'</div>';
			} else {
				summaryHtml +=
					'<div class="award-summary no-award">' +
					'<h2>' + titlePrefix + 'No Award</h2>' +
					'<div class="award-line">--</div>' +
					'<p class="award-detail">All of your bid choices were taken by more senior pilots.</p>' +
					'<p class="award-group">' + groupLabel + ' | Seniority #' + userResult.sen + '</p>' +
					'</div>';
			}

			// Build group table
			var tableTitle = (showBidTypeLabels ? (bidTypeLabel + ' - ') : '') +
				groupLabel + ' - All Awards (' + results.length + ' pilots)';

			tableHtml +=
				'<div class="group-table-wrapper">' +
				'<h3>' + tableTitle + '</h3>' +
				'<table class="group-table">' +
				'<thead><tr>' +
				'<th>#</th>' +
				'<th>Name</th>' +
				'<th>Sen</th>' +
				'<th>Awarded Line</th>' +
				'<th>Choice</th>' +
				'</tr></thead><tbody>';

			for (var i = 0; i < results.length; i++) {
				var r = results[i];
				var isUser = (r.id === userId);
				var rowClass = isUser ? ' class="highlight-row"' : '';
				var youBadge = isUser ? '<span class="you-badge">YOU</span>' : '';
				var lineText = r.awardedLine !== null ? r.awardedLine : '--';
				var choiceText = '<span class="' + getChoiceClass(r.choiceNumber) + '">' +
					getChoiceLabel(r.choiceNumber) + '</span>';

				tableHtml +=
					'<tr' + rowClass + '>' +
					'<td>' + (i + 1) + '</td>' +
					'<td>' + escapeHtml(r.name) + youBadge + '</td>' +
					'<td>' + r.sen + '</td>' +
					'<td>' + lineText + '</td>' +
					'<td>' + choiceText + '</td>' +
					'</tr>';
			}

			tableHtml += '</tbody></table></div>';
		}

		$summary.html(summaryHtml);
		$tableContainer.html(tableHtml);

		// Scroll to first user row
		setTimeout(function () {
			var $highlightRow = $('.highlight-row').first();
			if ($highlightRow.length) {
				$('html, body').animate({
					scrollTop: $highlightRow.offset().top - 200
				}, 500);
			}
		}, 100);
	}

	function escapeHtml(str) {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	// --- UI Logic ---

	$(function () {
		var $step1 = $('#step-1');
		var $step2 = $('#step-2');
		var $results = $('#results-container');
		var $error = $('#error-message');
		var $empInput = $('#employee-id-input');
		var $textarea = $('#bid-data-textarea');

		function showError(msg) {
			$error.html(msg).show();
		}

		function hideError() {
			$error.hide().empty();
		}

		function goToStep2() {
			var val = $.trim($empInput.val());
			if (!val || !/^\d+$/.test(val)) {
				showError('Please enter a valid numeric Employee ID.');
				return;
			}
			hideError();
			$step1.hide();
			$step2.addClass('active');
			$results.removeClass('active');
			$textarea.focus();
		}

		function goToStep1() {
			hideError();
			$step2.removeClass('active');
			$results.removeClass('active');
			$step1.show();
			$empInput.focus();
		}

		function calculate() {
			hideError();
			var userId = $.trim($empInput.val());
			var rawData = $textarea.val();

			if (!rawData || $.trim(rawData) === '') {
				showError('Please paste the bid data before calculating.');
				return;
			}

			var pilots = parseBidData(rawData);
			if (pilots.length === 0) {
				showError('No pilot records were found in the pasted data. Please check the format and try again.');
				return;
			}

			// Find all groups containing the user
			var userPilots = [];
			for (var i = 0; i < pilots.length; i++) {
				if (pilots[i].id === userId) {
					userPilots.push(pilots[i]);
				}
			}

			if (userPilots.length === 0) {
				showError('Employee ID "' + escapeHtml(userId) + '" was not found in the pasted data. Found ' +
					pilots.length + ' pilot(s) total. Please verify your ID and data.');
				return;
			}

			var groups = groupPilots(pilots);
			var allGroupResults = {};
			var userGroupData = [];

			// Collect distinct bid types to decide whether to show labels
			var bidTypes = {};

			for (var i = 0; i < userPilots.length; i++) {
				var up = userPilots[i];
				var groupKey = up.bidType + '|' + up.base + '-' + up.eqp + '-' + up.sta;
				bidTypes[up.bidType] = true;

				// Calculate awards for this group if not already done
				if (!allGroupResults[groupKey]) {
					allGroupResults[groupKey] = calculateAwards(groups[groupKey]);
				}

				// Find user result for crew partner lookup
				var results = allGroupResults[groupKey];
				var userResult = null;
				for (var j = 0; j < results.length; j++) {
					if (results[j].id === userId) {
						userResult = results[j];
						break;
					}
				}

				var partner = findCrewPartner(userResult, groups, allGroupResults);

				userGroupData.push({
					groupKey: groupKey,
					results: results,
					partner: partner
				});
			}

			var bidTypeCount = Object.keys(bidTypes).length;
			var showBidTypeLabels = bidTypeCount > 1;

			$step2.removeClass('active');
			$results.addClass('active');
			displayResults(userGroupData, userId, showBidTypeLabels);
		}

		function startOver() {
			hideError();
			$results.removeClass('active');
			$textarea.val('');
			$step1.show();
			$empInput.val('').focus();
		}

		// Event handlers
		$('#next-btn').on('click', goToStep2);
		$('#back-btn').on('click', goToStep1);
		$('#calculate-btn').on('click', calculate);
		$('#start-over-btn').on('click', startOver);

		$empInput.on('keypress', function (e) {
			if (e.which === 13) {
				e.preventDefault();
				goToStep2();
			}
		});

		// Focus the input on load
		$empInput.focus();
	});

})(jQuery);
