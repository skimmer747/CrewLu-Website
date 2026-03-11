(function ($) {
	'use strict';

	// --- Parsing ---

	function parseBidData(rawText) {
		var lines = rawText.split('\n');
		var pilots = [];
		var currentPilot = null;
		var currentBidType = 'SCHEDULE';
		var bidAsOfText = null;

		for (var i = 0; i < lines.length; i++) {
			var line = lines[i];

			// Extract "bids as of" timestamp
			var asOfMatch = line.match(/ONLY PILOTS WITH BIDS ON FILE AS OF\s+(.+?)\s+WILL BE LISTED/i);
			if (asOfMatch) {
				bidAsOfText = asOfMatch[1];
			}

			// Skip empty lines
			if ($.trim(line) === '') continue;

			// Detect bid type section headers before filtering headers
			var trimmedLine = $.trim(line);
			if (/SHORT\s+TERM\s+TRAINING\s+BIDS/i.test(trimmedLine)) {
				currentBidType = 'SHORT TERM TRAINING';
			} else if (/LONG\s+TERM\s+TRAINING\s+BIDS/i.test(trimmedLine)) {
				currentBidType = 'LONG TERM TRAINING';
			} else if (/SYSTEM\s+BIDS/i.test(trimmedLine)) {
				currentBidType = 'SYSTEM';
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

			// Try to match a pilot record line (optional EFFECT date before bids for system bids)
			var pilotMatch = line.match(/^\s*(.+?)\s{2,}(\d+)\s+(\d+)\s+([A-Z]{3,4})\s+(\w{2,3})\s+(CPT|F\/O)\s+(?:(\d{2}\/\d{2}\/\d{2})\s+)?([\d\s]*)$/);
			if (pilotMatch) {
				currentPilot = {
					name: $.trim(pilotMatch[1]),
					id: pilotMatch[2],
					sen: parseInt(pilotMatch[3], 10),
					base: pilotMatch[4],
					eqp: pilotMatch[5],
					sta: pilotMatch[6],
					effectDate: pilotMatch[7] || null,
					bids: parseBidNumbers(pilotMatch[8]),
					bidType: currentBidType
				};
				pilots.push(currentPilot);
				continue;
			}
		}

		return { pilots: pilots, bidAsOfText: bidAsOfText };
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
		if (/SYSTEM BIDS\s+Page/.test(trimmed)) return true;
		if (/SYSTEM BIDS\s*$/.test(trimmed)) return true;
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

	// --- System Bid Decoding ---

	var FLEET_MAP = {1: 'MD-11', 3: 'A300', 5: '757', 7: '747-100'};
	var SEAT_MAP = {1: 'CPT', 2: 'F/O'};
	var DOM_MAP = {1: 'SDF', 2: 'SDFZ', 3: 'ONT', 4: 'MIA', 5: 'ANC'};

	function decodeSystemBid(code) {
		var s = String(code);
		if (s.length !== 3) return s;
		var fleet = FLEET_MAP[parseInt(s[0], 10)];
		var seat = SEAT_MAP[parseInt(s[1], 10)];
		var dom = DOM_MAP[parseInt(s[2], 10)];
		if (!fleet || !seat || !dom) return s;
		return fleet + ' ' + seat + ' ' + dom;
	}

	// --- Grouping ---

	function groupPilots(pilots) {
		var groups = {};
		for (var i = 0; i < pilots.length; i++) {
			var p = pilots[i];
			var key = (p.bidType === 'SYSTEM')
				? 'SYSTEM|ALL'
				: p.bidType + '|' + p.base + '-' + p.eqp + '-' + p.sta;
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
				bids: pilot.bids,
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
		if (choiceNum === null) return 'No Bid';
		var suffix;
		var lastTwo = choiceNum % 100;
		if (lastTwo >= 11 && lastTwo <= 13) {
			suffix = 'th';
		} else {
			var lastOne = choiceNum % 10;
			if (lastOne === 1) suffix = 'st';
			else if (lastOne === 2) suffix = 'nd';
			else if (lastOne === 3) suffix = 'rd';
			else suffix = 'th';
		}
		return choiceNum + suffix + ' choice';
	}

	function getBidTypeLabel(bidType) {
		if (bidType === 'SHORT TERM TRAINING') return 'Short Term Training';
		if (bidType === 'LONG TERM TRAINING') return 'Long Term Training';
		if (bidType === 'SYSTEM') return 'System';
		return 'Schedule';
	}

	function formatGroupLabel(groupKey) {
		// groupKey format: "BIDTYPE|BASE-EQP-STA" or "SYSTEM|ALL"
		if (groupKey === 'SYSTEM|ALL') return 'System Preference List';
		var pipeIdx = groupKey.indexOf('|');
		var seatPart = groupKey.substring(pipeIdx + 1);
		var parts = seatPart.split('-');
		return parts[1] + ' ' + parts[2] + ' - ' + parts[0];
	}

	function sortByUserBidOrder(results, userResult) {
		var userBidMap = {};
		if (userResult && userResult.bids) {
			for (var i = 0; i < userResult.bids.length; i++) {
				userBidMap[userResult.bids[i]] = i;
			}
		}

		return results.slice().sort(function (a, b) {
			var aIdx = (a.awardedLine !== null && userBidMap.hasOwnProperty(a.awardedLine))
				? userBidMap[a.awardedLine] : Infinity;
			var bIdx = (b.awardedLine !== null && userBidMap.hasOwnProperty(b.awardedLine))
				? userBidMap[b.awardedLine] : Infinity;

			if (aIdx !== bIdx) return aIdx - bIdx;

			// Both unmatched: no-award goes after awarded
			var aHasAward = a.awardedLine !== null ? 0 : 1;
			var bHasAward = b.awardedLine !== null ? 0 : 1;
			if (aHasAward !== bHasAward) return aHasAward - bHasAward;

			return a.sen - b.sen;
		});
	}

	function filterToBids(results, userId, userBidSet) {
		return results.filter(function (r) {
			return r.id === userId || userBidSet[r.awardedLine];
		});
	}

	function buildTableBody(sortedResults, userId, userBidSet, userSen, viewMode) {
		var html = '';
		for (var i = 0; i < sortedResults.length; i++) {
			var r = sortedResults[i];
			var isUser = (r.id === userId);
			var rowClass = isUser ? ' class="highlight-row"' : '';
			var youBadge = isUser ? '<span class="you-badge">YOU</span>' : '';
			var lineText;
			if (r.awardedLine !== null) {
				if (isUser) {
					lineText = '<span class="my-award-line">' + r.awardedLine + '</span>';
				} else if (userBidSet[r.awardedLine]) {
					var colorClass = (r.sen < userSen) ? 'line-senior' : 'line-junior';
					if (viewMode === 'bid-order') {
						lineText = '<span class="bid-line-box ' + colorClass + '">' + r.awardedLine + '</span>';
					} else {
						lineText = '<span class="' + colorClass + '">' + r.awardedLine + '</span>';
					}
				} else {
					lineText = '' + r.awardedLine;
				}
			} else {
				lineText = '--';
			}
			var choiceText = '<span class="' + getChoiceClass(r.choiceNumber) + '">' +
				getChoiceLabel(r.choiceNumber) + '</span>';

			html +=
				'<tr' + rowClass + '>' +
				'<td>' + (i + 1) + '</td>' +
				'<td><a class="pilot-name-link" data-pilot-id="' + escapeHtml(r.id) + '">' + escapeHtml(r.name) + '</a>' + youBadge + '</td>' +
				'<td>' + r.sen + '</td>' +
				'<td>' + lineText + '</td>' +
				'<td>' + choiceText + '</td>' +
				'</tr>';
		}
		return html;
	}

	function displayResults(userGroupData, userId, showBidTypeLabels, bidAsOfText) {
		var $summary = $('#award-summary');
		var $tableContainer = $('#group-table-container');
		$summary.empty();
		$tableContainer.empty();

		if (userGroupData.length === 0) {
			var notFoundHtml = '';
			if (bidAsOfText) {
				notFoundHtml += '<div class="bid-as-of">Bids on file as of ' + escapeHtml(bidAsOfText) + '</div>';
			}
			notFoundHtml += '<div class="award-summary no-award">' +
				'<h2>Employee ID Not Found</h2>' +
				'<p class="award-detail">ID "' + escapeHtml(userId) + '" was not found in the parsed bid data.</p>' +
				'<p class="award-detail">Make sure you entered the correct Employee ID and pasted the complete bid data.</p>' +
				'</div>';
			$summary.html(notFoundHtml);
			return;
		}

		var summaryHtml = '';
		if (bidAsOfText) {
			summaryHtml += '<div class="bid-as-of">Bids on file as of ' + escapeHtml(bidAsOfText) + '</div>';
		}
		var tableHtml = '';
		var tableIndex = 0;

		for (var g = 0; g < userGroupData.length; g++) {
			var data = userGroupData[g];
			var results = data.results;
			var groupKey = data.groupKey;
			var partner = data.partner;
			var isSystem = (groupKey === 'SYSTEM|ALL');

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

			if (isSystem) {
				// System bid summary card (no table for system bids)
				var effectHtml = userResult.effectDate
					? '<p class="award-detail">Effective Date: ' + escapeHtml(userResult.effectDate) + '</p>'
					: '';
				var bidsListHtml = '';
				if (userResult.bids.length > 0) {
					for (var b = 0; b < userResult.bids.length; b++) {
						bidsListHtml += '<div class="system-bid-item">' +
							'<span class="system-bid-num">' + (b + 1) + '.</span> ' +
							escapeHtml(decodeSystemBid(userResult.bids[b])) +
							'</div>';
					}
				} else {
					bidsListHtml = 'None';
				}

				summaryHtml +=
					'<div class="award-summary">' +
					'<h2>' + titlePrefix + 'Your System Bids</h2>' +
					'<p class="award-detail">Current Assignment: ' +
					escapeHtml(userResult.base) + ' ' + escapeHtml(userResult.eqp) + ' ' + escapeHtml(userResult.sta) + '</p>' +
					effectHtml +
					'<div class="system-bids-list">' + bidsListHtml + '</div>' +
					'<p class="system-bid-disclaimer">These are your current system bid preferences on file. They are not bids that have been awarded and can be changed at any time.</p>' +
					'<p class="award-group">Seniority #' + userResult.sen + '</p>' +
					'</div>';
			} else {
				// Schedule/Training bid summary card
				var partnerHtml = '';
				if (partner) {
					partnerHtml = '<p class="award-partner">Flying with: ' +
						escapeHtml(partner.name) + ' (Sen #' + partner.sen + ')</p>';
				}

				if (userResult.awardedLine !== null) {
					summaryHtml +=
						'<div class="award-summary">' +
						'<h2>' + titlePrefix + 'Your Bid</h2>' +
						'<div class="award-line">Line ' + userResult.awardedLine + '</div>' +
						'<p class="award-detail"><span class="' + getChoiceClass(userResult.choiceNumber) + '">' +
						getChoiceLabel(userResult.choiceNumber) + '</span> out of ' + userResult.totalBids + ' bid(s)</p>' +
						partnerHtml +
						'<p class="award-group">' + groupLabel + ' | Seniority #' + userResult.sen + '</p>' +
						'</div>';
				} else {
					summaryHtml +=
						'<div class="award-summary no-award">' +
						'<h2>' + titlePrefix + 'No Bid</h2>' +
						'<div class="award-line">--</div>' +
						'<p class="award-detail">All of your bid choices were taken by more senior pilots.</p>' +
						'<p class="award-group">' + groupLabel + ' | Seniority #' + userResult.sen + '</p>' +
						'</div>';
				}

				// Build a set of lines the user bid on for color-coding
				var userBidSet = {};
				if (userResult && userResult.bids) {
					for (var b = 0; b < userResult.bids.length; b++) {
						userBidSet[userResult.bids[b]] = true;
					}
				}
				var userSen = userResult ? userResult.sen : 0;

				// Schedule/Training bid table
				var tableTitle = (showBidTypeLabels ? (bidTypeLabel + ' - ') : '') +
					groupLabel + ' - All Bids (' + results.length + ' pilots)';

				var wrapperId = 'group-table-' + tableIndex;
				tableIndex++;

				tableHtml +=
					'<div class="group-table-wrapper" id="' + wrapperId + '"' +
					' data-user-id="' + escapeHtml(userId) + '"' +
					' data-user-sen="' + userSen + '">' +
					'<h3>' + tableTitle + '</h3>' +
					'<div class="sort-toggle">' +
					'<button class="sort-btn" data-sort="seniority">Seniority</button>' +
					'<button class="sort-btn active" data-sort="bid-order">My Bid Order</button>' +
					'</div>' +
					'<div class="filter-toggle">' +
					'<button class="filter-btn" data-filter="all">All Pilots</button>' +
					'<button class="filter-btn active" data-filter="my-bids">My Bids</button>' +
					'</div>' +
					'<table class="group-table">' +
					'<thead><tr>' +
					'<th>#</th>' +
					'<th>Name</th>' +
					'<th>Sen</th>' +
					'<th>Line</th>' +
					'<th>Choice</th>' +
					'</tr></thead><tbody>' +
					buildTableBody(filterToBids(sortByUserBidOrder(results, userResult), userId, userBidSet), userId, userBidSet, userSen, 'bid-order') +
					'</tbody></table></div>';
			}
		}

		$summary.html(summaryHtml);
		$tableContainer.html(tableHtml);

		// Store data on each table wrapper for re-sorting
		tableIndex = 0;
		for (var g = 0; g < userGroupData.length; g++) {
			var data = userGroupData[g];
			if (data.groupKey === 'SYSTEM|ALL') continue;

			var userResult = null;
			for (var i = 0; i < data.results.length; i++) {
				if (data.results[i].id === userId) {
					userResult = data.results[i];
					break;
				}
			}
			if (!userResult) continue;

			var userBidSet = {};
			if (userResult && userResult.bids) {
				for (var b = 0; b < userResult.bids.length; b++) {
					userBidSet[userResult.bids[b]] = true;
				}
			}

			var $wrapper = $('#group-table-' + tableIndex);
			$wrapper.data('groupData', {
				results: data.results,
				userResult: userResult,
				userBidSet: userBidSet
			});
			tableIndex++;
		}

		// Sort toggle click handler
		$tableContainer.on('click', '.sort-btn', function () {
			var $btn = $(this);
			var $wrapper = $btn.closest('.group-table-wrapper');
			var $toggle = $btn.closest('.sort-toggle');

			$toggle.find('.sort-btn').removeClass('active');
			$btn.addClass('active');

			var groupData = $wrapper.data('groupData');
			var uid = $wrapper.attr('data-user-id');
			var uSen = parseInt($wrapper.attr('data-user-sen'), 10);
			var sortType = $btn.attr('data-sort');

			var sorted;
			if (sortType === 'bid-order') {
				sorted = sortByUserBidOrder(groupData.results, groupData.userResult);
			} else {
				sorted = groupData.results.slice();
			}

			var filterType = $wrapper.find('.filter-btn.active').attr('data-filter');
			if (filterType === 'my-bids') {
				sorted = filterToBids(sorted, uid, groupData.userBidSet);
			}

			$wrapper.find('tbody').html(
				buildTableBody(sorted, uid, groupData.userBidSet, uSen, sortType)
			);
		});

		// Filter toggle click handler
		$tableContainer.on('click', '.filter-btn', function () {
			var $btn = $(this);
			var $wrapper = $btn.closest('.group-table-wrapper');
			var $toggle = $btn.closest('.filter-toggle');

			$toggle.find('.filter-btn').removeClass('active');
			$btn.addClass('active');

			var groupData = $wrapper.data('groupData');
			var uid = $wrapper.attr('data-user-id');
			var uSen = parseInt($wrapper.attr('data-user-sen'), 10);

			var sortType = $wrapper.find('.sort-btn.active').attr('data-sort');
			var filterType = $btn.attr('data-filter');

			var sorted;
			if (sortType === 'bid-order') {
				sorted = sortByUserBidOrder(groupData.results, groupData.userResult);
			} else {
				sorted = groupData.results.slice();
			}

			if (filterType === 'my-bids') {
				sorted = filterToBids(sorted, uid, groupData.userBidSet);
			}

			$wrapper.find('tbody').html(
				buildTableBody(sorted, uid, groupData.userBidSet, uSen, sortType)
			);
		});

		// Pilot name click handler - show bid list popup
		$tableContainer.on('click', '.pilot-name-link', function (e) {
			e.preventDefault();
			var pilotId = $(this).attr('data-pilot-id');
			var $wrapper = $(this).closest('.group-table-wrapper');
			var groupData = $wrapper.data('groupData');
			if (!groupData) return;

			var pilot = null;
			for (var i = 0; i < groupData.results.length; i++) {
				if (groupData.results[i].id === pilotId) {
					pilot = groupData.results[i];
					break;
				}
			}
			if (!pilot) return;

			// Build set of lines taken by more senior pilots
			var takenLines = {};
			for (var k = 0; k < groupData.results.length; k++) {
				var r = groupData.results[k];
				if (r.sen < pilot.sen && r.awardedLine !== null) {
					takenLines[r.awardedLine] = true;
				}
			}

			// Build bid list HTML with availability-based coloring
			var bidsHtml = '';
			for (var j = 0; j < pilot.bids.length; j++) {
				var bidNum = pilot.bids[j];
				var choicePos = j + 1;
				var colorClass = takenLines[bidNum] ? 'line-senior' : 'line-junior';
				var isAwarded = (bidNum === pilot.awardedLine);
				var awardedBadge = isAwarded ? ' <span class="bid-awarded-badge">AWARDED</span>' : '';
				var itemClass = 'bid-list-item ' + colorClass + (isAwarded ? ' bid-list-awarded' : '');
				bidsHtml +=
					'<div class="' + itemClass + '">' +
					'<span class="bid-list-num">' + choicePos + '.</span> ' +
					'Line ' + bidNum + awardedBadge +
					'</div>';
			}
			if (pilot.bids.length === 0) {
				bidsHtml = '<div class="bid-list-empty">No bids on file</div>';
			}

			var pilotInfo = 'Sen #' + pilot.sen + ' | ' +
				escapeHtml(pilot.base) + ' ' + escapeHtml(pilot.eqp) + ' ' + escapeHtml(pilot.sta);

			var popupHtml =
				'<div class="bid-popup-overlay">' +
				'<div class="bid-popup">' +
				'<div class="bid-popup-header">' +
				'<h3>' + escapeHtml(pilot.name) + '</h3>' +
				'<p>' + pilotInfo + '</p>' +
				'</div>' +
				'<div class="bid-popup-body">' + bidsHtml + '</div>' +
				'<div class="bid-popup-footer">' +
				'<button class="button bid-popup-close">Close</button>' +
				'</div>' +
				'</div>' +
				'</div>';

			// Remove any existing popup
			$('.bid-popup-overlay').remove();
			$('body').append(popupHtml);

			// Close handlers
			var $overlay = $('.bid-popup-overlay');
			$overlay.on('click', function (ev) {
				if ($(ev.target).hasClass('bid-popup-overlay') || $(ev.target).hasClass('bid-popup-close')) {
					$overlay.remove();
					$(document).off('keydown.bidPopup');
				}
			});
			$(document).on('keydown.bidPopup', function (ev) {
				if (ev.which === 27) {
					$overlay.remove();
					$(document).off('keydown.bidPopup');
				}
			});
		});

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

		// Renders msg as plain text (no HTML) so it is safe to pass user-derived content.
		function showError(msg) {
			$error.text(msg).show();
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

			var parsed = parseBidData(rawData);
			var pilots = parsed.pilots;
			var bidAsOfText = parsed.bidAsOfText;
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
				showError('Employee ID "' + userId + '" was not found in the pasted data. Found ' +
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
				var isSystem = (up.bidType === 'SYSTEM');
				var groupKey = isSystem
					? 'SYSTEM|ALL'
					: up.bidType + '|' + up.base + '-' + up.eqp + '-' + up.sta;
				bidTypes[up.bidType] = true;

				// Skip if we already processed this group
				if (allGroupResults[groupKey]) continue;

				if (isSystem) {
					// System bids: no awarding, just sort by seniority and pass through
					var sorted = groups[groupKey].slice().sort(function (a, b) {
						return a.sen - b.sen;
					});
					var systemResults = [];
					for (var j = 0; j < sorted.length; j++) {
						var sp = sorted[j];
						systemResults.push({
							name: sp.name,
							id: sp.id,
							sen: sp.sen,
							base: sp.base,
							eqp: sp.eqp,
							sta: sp.sta,
							effectDate: sp.effectDate,
							bids: sp.bids,
							bidType: sp.bidType,
							awardedLine: null,
							choiceNumber: null,
							totalBids: sp.bids.length
						});
					}
					allGroupResults[groupKey] = systemResults;

					userGroupData.push({
						groupKey: groupKey,
						results: systemResults,
						partner: null
					});
				} else {
					// Schedule/Training bids: calculate awards
					allGroupResults[groupKey] = calculateAwards(groups[groupKey]);

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
			}

			var bidTypeCount = Object.keys(bidTypes).length;
			var showBidTypeLabels = bidTypeCount > 1;

			$step2.removeClass('active');
			$results.addClass('active');
			displayResults(userGroupData, userId, showBidTypeLabels, bidAsOfText);
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
