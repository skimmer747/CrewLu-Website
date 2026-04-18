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
	// Pilot roster uses different fleet codes than the display names above.
	var FLEET_ROSTER_MAP = {1: 'M1F', 3: 'A30', 5: '757', 7: '74Y'};

	function decodeSystemBid(code) {
		var s = String(code);
		if (s.length !== 3) return s;
		var fleet = FLEET_MAP[parseInt(s[0], 10)];
		var seat = SEAT_MAP[parseInt(s[1], 10)];
		var dom = DOM_MAP[parseInt(s[2], 10)];
		if (!fleet || !seat || !dom) return s;
		return fleet + ' ' + seat + ' ' + dom;
	}

	function systemBidRankInfo(code, userSen) {
		var s = String(code);
		if (s.length !== 3) return null;
		var rosterEqp = FLEET_ROSTER_MAP[parseInt(s[0], 10)];
		var seat = SEAT_MAP[parseInt(s[1], 10)];
		var dom = DOM_MAP[parseInt(s[2], 10)];
		if (!rosterEqp || !seat || !dom) return null;
		var info = lookupExpectedSeniors(rosterEqp, dom, seat, userSen);
		if (!info) return null;
		return { rank: info.above.length + 1, total: info.total };
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

	// --- Hold Risk Analysis ---

	function lookupExpectedSeniors(eqp, dom, seat, userSen) {
		if (typeof GLOBAL_PILOT_DATA === 'undefined') return null;
		// Bid paste uses "F/O"; roster uses "FO"
		var rosterSeat = (seat === 'F/O') ? 'FO' : seat;
		var byEqp = GLOBAL_PILOT_DATA[eqp];
		if (!byEqp) return null;
		var byDom = byEqp[dom];
		if (!byDom) return null;
		var roster = byDom[rosterSeat];
		if (!roster || !roster.length) return null;
		var expected = [];
		for (var i = 0; i < roster.length; i++) {
			if (roster[i].sen < userSen) expected.push(roster[i].sen);
		}
		return { above: expected, total: roster.length };
	}

	function estimateLineCount(groupResults) {
		var lineSet = {};
		var count = 0;
		var maxLine = 0;
		for (var i = 0; i < groupResults.length; i++) {
			var bids = groupResults[i].bids;
			for (var j = 0; j < bids.length; j++) {
				var n = bids[j];
				if (!lineSet[n]) {
					lineSet[n] = true;
					count++;
				}
				if (n > maxLine) maxLine = n;
			}
			if (groupResults[i].awardedLine !== null && !lineSet[groupResults[i].awardedLine]) {
				lineSet[groupResults[i].awardedLine] = true;
				count++;
				if (groupResults[i].awardedLine > maxLine) maxLine = groupResults[i].awardedLine;
			}
		}
		// Fall back to max line seen if the distinct set is somehow smaller.
		return Math.max(count, maxLine);
	}

	// Sliding-scale reserve trim: top 10% of the group treat the bottom 30% of lines
	// as reserve/undesirable; the trim fades linearly to 0 at the bottom-seniority bidder.
	function reserveTrimFactor(rankPct) {
		if (rankPct <= 0.10) return 0.30;
		if (rankPct >= 1.0) return 0;
		return 0.30 * (1 - rankPct) / 0.90;
	}

	function computeHoldProbability(userResult, groupResults, missingCount, groupSize) {
		var U = userResult.sen;

		// N = submitted seniors above the user
		var N = 0;
		for (var i = 0; i < groupResults.length; i++) {
			if (groupResults[i].sen < U) N++;
		}

		var S = N + missingCount;
		var Kpaste = estimateLineCount(groupResults);

		// Paste-derived K only sees lines that appeared in submitted bids. Early in the
		// bid window, that undercounts the true fleet line pool. Use roster group size
		// as a floor so senior bidders can plausibly land on lines outside the user's
		// bid list. This prevents the S > K_paste collapse to 0%.
		var K = Kpaste;
		if (typeof groupSize === 'number' && groupSize > K) K = groupSize;

		// User's seniority rank within the full group (0 = most senior, 1 = bottom bidder).
		// Falls back to 0 (top) when group size is unknown, giving the max reserve trim.
		var rankPct = 0;
		if (typeof groupSize === 'number' && groupSize > 1) {
			rankPct = S / (groupSize - 1);
			if (rankPct > 1) rankPct = 1;
		}
		var trim = reserveTrimFactor(rankPct);
		var Keff = Math.max(1, Math.round(K * (1 - trim)));
		var Seff = Math.min(S, Keff);
		var Neff = Math.min(N, Keff);

		// Edge: user is most senior, or everyone above them has submitted.
		if (Seff === 0 || missingCount === 0) {
			return { probHold: 1, K: K, Keff: Keff, N: N, S: S, trim: trim, method: 'closed-form-uniform' };
		}

		// Pathological: not enough desirable lines left to absorb the missing bids.
		if (Keff - Neff <= 0) {
			return { probHold: 0, K: K, Keff: Keff, N: N, S: S, trim: trim, method: 'closed-form-uniform' };
		}

		var probHold = (Keff - Seff) / (Keff - Neff);
		if (probHold < 0) probHold = 0;
		if (probHold > 1) probHold = 1;

		return { probHold: probHold, K: K, Keff: Keff, N: N, S: S, trim: trim, method: 'closed-form-uniform' };
	}

	function computeHoldRisk(userResult, groupResults) {
		if (!userResult || userResult.awardedLine === null) return null;
		if (userResult.bidType === 'SYSTEM') return null;

		var L = userResult.awardedLine;
		var U = userResult.sen;

		// Identify missing seniors from roster
		var rosterInfo = lookupExpectedSeniors(
			userResult.eqp, userResult.base, userResult.sta, U
		);
		var rosterAvailable = rosterInfo !== null;
		var missingSens = [];
		var groupSize = null;
		if (rosterAvailable) {
			groupSize = rosterInfo.total;
			var pastedSens = {};
			for (var i = 0; i < groupResults.length; i++) {
				pastedSens[groupResults[i].sen] = true;
			}
			for (var j = 0; j < rosterInfo.above.length; j++) {
				if (!pastedSens[rosterInfo.above[j]]) missingSens.push(rosterInfo.above[j]);
			}
		}

		// Closed-form hold probability
		var prob = null;
		if (rosterAvailable) {
			prob = computeHoldProbability(userResult, groupResults, missingSens.length, groupSize);
		}

		// Rank-change sensitivity: submitted seniors who already rank L in top 3
		var atRisk = [];
		var topThreeCount = 0;
		for (var k2 = 0; k2 < groupResults.length; k2++) {
			var s = groupResults[k2];
			if (s.sen >= U) continue;
			var idx = -1;
			for (var m2 = 0; m2 < s.bids.length; m2++) {
				if (s.bids[m2] === L) { idx = m2; break; }
			}
			if (idx === -1) continue;
			var rank = idx + 1;
			if (rank <= 3) {
				topThreeCount++;
				atRisk.push({ sen: s.sen, rank: rank, name: s.name });
			}
		}
		atRisk.sort(function (a, b) { return a.rank - b.rank; });

		// Build ordered slots (most senior → least) for the submission tracker,
		// classifying each submitted senior as "hurt" (took one of the user's
		// higher-ranked bid choices) or "harmless" (submitted but didn't block
		// any of the user's top picks).
		var userTopBids = {};
		if (userResult.bids && userResult.choiceNumber) {
			for (var t = 0; t < userResult.choiceNumber - 1; t++) {
				userTopBids[userResult.bids[t]] = true;
			}
		}
		var submittedAbove = [];
		for (var sa = 0; sa < groupResults.length; sa++) {
			if (groupResults[sa].sen < U) submittedAbove.push(groupResults[sa]);
		}
		submittedAbove.sort(function (a, b) { return a.sen - b.sen; });
		var missingSorted = missingSens.slice().sort(function (a, b) { return a - b; });

		var slots = [];
		var si = 0, mi = 0;
		while (si < submittedAbove.length || mi < missingSorted.length) {
			var subSen = si < submittedAbove.length ? submittedAbove[si].sen : Infinity;
			var missSen = mi < missingSorted.length ? missingSorted[mi] : Infinity;
			if (subSen <= missSen) {
				var sp = submittedAbove[si];
				var tookTopBid = sp.awardedLine !== null && !!userTopBids[sp.awardedLine];
				slots.push({
					state: tookTopBid ? 'hurt' : 'harmless',
					sen: sp.sen,
					name: sp.name,
					awardedLine: sp.awardedLine
				});
				si++;
			} else {
				slots.push({ state: 'missing', sen: missSen });
				mi++;
			}
		}

		return {
			rosterAvailable: rosterAvailable,
			missingCount: missingSens.length,
			missingSens: missingSens,
			prob: prob,
			atRisk: atRisk,
			topThreeCount: topThreeCount,
			awardedLine: L,
			slots: slots
		};
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

	function renderSubmissionTracker(slots, S, N) {
		if (!slots || slots.length === 0) return '';
		var dots = '';
		var hurtCount = 0;
		for (var i = 0; i < slots.length; i++) {
			var s = slots[i];
			var cls = 'submission-dot';
			var title;
			if (s.state === 'hurt') {
				cls += ' hurt';
				hurtCount++;
				title = (s.name ? s.name + ' (Sen #' + s.sen + ')' : 'Sen #' + s.sen) +
					' took line ' + s.awardedLine + ' — one of your higher choices';
			} else if (s.state === 'harmless') {
				cls += ' submitted';
				title = (s.name ? s.name + ' (Sen #' + s.sen + ')' : 'Sen #' + s.sen) +
					' submitted — awarded line ' + (s.awardedLine === null ? '—' : s.awardedLine);
			} else {
				title = 'Sen #' + s.sen + ' — not yet submitted';
			}
			dots += '<span class="' + cls + '" title="' + escapeHtml(title) + '"></span>';
		}
		var pilotWord = (S === 1) ? 'senior pilot' : 'senior pilots';
		var hurtNote = hurtCount > 0
			? ' &middot; <span class="hold-risk-danger"><strong>' + hurtCount +
				'</strong> took one of your top ' + hurtCount + ' choices</span>'
			: '';
		return '<div class="submission-tracker">' +
			'<div class="submission-icons">' + dots + '</div>' +
			'<div class="submission-caption">' +
			'&#9992;&#65039; <strong>' + N + '</strong> of <strong>' + S + '</strong> ' +
			pilotWord + ' above you submitted' + hurtNote +
			'</div></div>';
	}

	function renderHoldGauge(probHold, line) {
		var pct = Math.round(probHold * 100);
		var gaugeClass = pct >= 80 ? 'gauge-safe'
			: pct >= 40 ? 'gauge-warn'
			: 'gauge-danger';
		var display = (pct === 0 && probHold > 0) ? '&lt;1%' : pct + '%';
		var radius = 50;
		var circumference = 2 * Math.PI * radius;
		var offset = circumference * (1 - Math.max(0, Math.min(1, probHold)));
		return '<div class="hold-gauge-wrap">' +
			'<div class="hold-gauge-title">Chance of keeping</div>' +
			'<div class="hold-gauge-ring">' +
			'<svg class="hold-gauge" width="120" height="120" viewBox="0 0 120 120">' +
			'<circle class="hold-gauge-track" cx="60" cy="60" r="' + radius + '"/>' +
			'<circle class="hold-gauge-fill ' + gaugeClass + '" cx="60" cy="60" r="' + radius + '" ' +
			'stroke-dasharray="' + circumference.toFixed(2) + '" ' +
			'stroke-dashoffset="' + offset.toFixed(2) + '"/>' +
			'</svg>' +
			'<div class="hold-gauge-label">' +
			'<div class="hold-gauge-pct">' + display + '</div>' +
			'<div class="hold-gauge-sub">Line ' + line + '</div>' +
			'</div>' +
			'</div>' +
			'</div>';
	}

	function renderSnark(risk) {
		var missing = risk.missingSens || [];
		var n = missing.length;
		if (!risk.prob) return '';
		if (risk.prob.S === 0) return '';

		if (n === 0) {
			return '<div class="hold-snark snark-safe">' +
				'&#128274; All senior bids are in &mdash; what you see is what you fly.' +
				'</div>';
		}
		if (n === 1) {
			return '<div class="hold-snark">' +
				'&#127919; Down to the wire &mdash; just Sen #' + missing[0] +
				' left. Fingers crossed they&rsquo;re not feeling spicy today.' +
				'</div>';
		}
		if (n === 2) {
			return '<div class="hold-snark">' +
				'&#128064; Just Sen #' + missing[0] + ' and Sen #' + missing[1] +
				' between you and the gavel. Casual.' +
				'</div>';
		}
		if (n === 3) {
			return '<div class="hold-snark">' +
				'&#9203; Three names left to bid: Sen #' + missing[0] + ', #' + missing[1] +
				', #' + missing[2] + '. They&rsquo;re probably on a layover somewhere nice.' +
				'</div>';
		}
		return '';
	}

	function renderHoldRisk(risk, line) {
		if (!risk) return '';

		var body = '';

		if (risk.prob) {
			var S = risk.prob.S;
			var N = risk.prob.N;
			body +=
				'<div class="hold-risk-graphics">' +
				renderSubmissionTracker(risk.slots, S, N) +
				renderHoldGauge(risk.prob.probHold, line) +
				'</div>';

			// Caption (methodology note, smaller)
			var caption;
			if (S === 0) {
				caption = 'You are the most senior pilot in this group.';
			} else if (risk.missingCount === 0) {
				caption = 'All ' + S + ' senior pilots above you have submitted.';
			} else {
				var poolNote = (risk.prob.trim > 0 && risk.prob.Keff !== risk.prob.K)
					? '~' + risk.prob.Keff + ' desirable lines (of ' + risk.prob.K +
						', trimming ' + Math.round(risk.prob.trim * 100) + '% reserve)'
					: '~' + risk.prob.K + ' lines';
				caption = 'Uniform-bid baseline across ' + poolNote + '.';
			}
			body += '<div class="hold-risk-caption">' + caption + '</div>';

			body += renderSnark(risk);
		}

		if (risk.topThreeCount > 0) {
			var threatWord = (risk.topThreeCount === 1) ? 'senior pilot ranks' : 'senior pilots rank';
			var listItems = '';
			for (var i = 0; i < risk.atRisk.length; i++) {
				var r = risk.atRisk[i];
				var nameLabel = r.name ? escapeHtml(r.name) + ' (Sen #' + r.sen + ')' : 'Sen #' + r.sen;
				listItems +=
					'<li class="hold-risk-item">' + nameLabel +
					' &mdash; line ' + line + ' is their #' + r.rank + ' choice</li>';
			}
			body +=
				'<details class="hold-risk-row hold-risk-details">' +
				'<summary><span class="hold-risk-count">' + risk.topThreeCount + '</span> submitted ' +
				threatWord + ' line ' + line + ' in their top 3</summary>' +
				'<ul class="hold-risk-list">' + listItems + '</ul>' +
				'</details>';
		}

		if (!body) {
			if (!risk.rosterAvailable) return '';
			body = '<div class="hold-risk-row hold-risk-safe">Line looks secure based on pasted bids.</div>';
		}

		return '<div class="hold-risk">' +
			'<div class="hold-risk-title">Line Hold Risk</div>' +
			body +
			'<div class="hold-risk-disclaimer">Based on currently pasted bids &mdash; not a prediction.</div>' +
			'</div>';
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

		// Render System bid summaries first so each Schedule/Training summary
		// stays adjacent to its own bid table below.
		userGroupData = userGroupData.slice().sort(function (a, b) {
			var aSys = a.groupKey === 'SYSTEM|ALL' ? 0 : 1;
			var bSys = b.groupKey === 'SYSTEM|ALL' ? 0 : 1;
			return aSys - bSys;
		});

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
						var bidCode = userResult.bids[b];
						var rankInfo = systemBidRankInfo(bidCode, userResult.sen);
						var rankHtml = rankInfo
							? ' <span class="system-bid-rank">&mdash; ' + rankInfo.rank + ' of ' + rankInfo.total + '</span>'
							: '';
						bidsListHtml += '<div class="system-bid-item">' +
							'<span class="system-bid-num">' + (b + 1) + '.</span> ' +
							escapeHtml(decodeSystemBid(bidCode)) +
							rankHtml +
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
						renderHoldRisk(data.holdRisk, userResult.awardedLine) +
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
					'<div class="table-toolbar">' +
					'<div class="toolbar-group">' +
					'<span class="toolbar-label">Sort:</span>' +
					'<div class="seg-toggle">' +
					'<button class="sort-btn" data-sort="seniority">Seniority</button>' +
					'<button class="sort-btn active" data-sort="bid-order">My Bid Order</button>' +
					'</div>' +
					'</div>' +
					'<div class="toolbar-group">' +
					'<span class="toolbar-label">Show:</span>' +
					'<div class="seg-toggle">' +
					'<button class="filter-btn" data-filter="all">All Pilots</button>' +
					'<button class="filter-btn active" data-filter="my-bids">My Bids</button>' +
					'</div>' +
					'</div>' +
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
			var $toggle = $btn.closest('.seg-toggle');

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
			var $toggle = $btn.closest('.seg-toggle');

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
					var holdRisk = computeHoldRisk(userResult, results);

					userGroupData.push({
						groupKey: groupKey,
						results: results,
						partner: partner,
						holdRisk: holdRisk
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

	window.__crewluHoldRisk = computeHoldRisk;
	window.__crewluHoldProb = computeHoldProbability;

})(jQuery);
