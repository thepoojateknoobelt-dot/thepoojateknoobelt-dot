import { Roll, Cut, Order, OptimizationCandidate } from '../types';

/**
 * Advanced Optimization Engine for industrial belt cutting.
 * Prioritizes remnants and inventory-matched pieces first.
 */
export const findGlobalBestPlacement = (rolls: Roll[], order: Order): OptimizationCandidate[] => {
  // Filter compatible, non-archived, non-refused rolls
  const compatibleRolls = rolls.filter(r => 
    r.materialType === order.materialType && 
    !r.isArchived && 
    r.status !== 'refused'
  );

  const getCandidatesForRolls = (subsetRolls: Roll[]): OptimizationCandidate[] => {
    const candidates: OptimizationCandidate[] = [];

    for (const roll of subsetRolls) {
      // Strategy: Find the "lowest X" available for each Y-track
      // We test at x=0 and after every existing cut
      const testXPoints = [0];
      roll.cuts.forEach(c => testXPoints.push(c.x + c.length));

      // Sort X points to process from start of roll
      const sortedX = [...new Set(testXPoints)].sort((a, b) => a - b);

      // Test Y positions: Top edge, Bottom edge, and aligned with existing cuts
      const testYPoints = [0, roll.fullWidth - order.requiredWidth];
      roll.cuts.forEach(c => {
        testYPoints.push(c.y);
        testYPoints.push(c.y + c.width);
        testYPoints.push(c.y + c.width - order.requiredWidth);
      });

      const uniqueY = [...new Set(testYPoints)].filter(y => y >= 0 && y + order.requiredWidth <= roll.fullWidth + 0.001);

      sortedX.forEach(x => {
        uniqueY.forEach(y => {
          const roundedX = Math.round(x * 100) / 100;
          const roundedY = Math.round(y * 100) / 100;

          if (isSpaceAvailable(roll, roundedX, roundedY, order.requiredWidth, order.requiredLength)) {
            const scoreData = calculatePrecisionScore(roll, order, { x: roundedX, y: roundedY });

            const isDuplicate = candidates.some(c =>
              c.rollId === roll.id &&
              Math.abs(c.placement.x - roundedX) < 0.01 &&
              Math.abs(c.placement.y - roundedY) < 0.01
            );

            if (!isDuplicate) {
              candidates.push({
                rollId: roll.id,
                placement: { x: roundedX, y: roundedY },
                score: scoreData.score,
                reason: scoreData.reason,
                wastageImpact: scoreData.wastage
              });
            }
          }
        });
      });
    }

    // Sort by score descending. If scores are equal, prefer lower X (earlier in roll)
    const sorted = candidates.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.1) return b.score - a.score;
      return a.placement.x - b.placement.x;
    });

    // Deduplicate candidates by rollId to only keep the best placement strategy for each unique roll
    const uniqueRollCandidates: OptimizationCandidate[] = [];
    const seenRollIds = new Set<string>();
    for (const candidate of sorted) {
      if (!seenRollIds.has(candidate.rollId)) {
        seenRollIds.add(candidate.rollId);
        uniqueRollCandidates.push(candidate);
      }
    }

    return uniqueRollCandidates;
  };

  // Evaluate remnants and fresh rolls together to produce a comprehensive list of recommendations.
  // The precision score naturally handles prioritizing remnants and size matching.
  const candidates = getCandidatesForRolls(compatibleRolls);
  return candidates.slice(0, 10);
};

const calculatePrecisionScore = (roll: Roll, order: Order, placement: { x: number; y: number }) => {
  let score = 0;
  let reasons: string[] = [];

  const { x, y } = placement;
  const { requiredWidth, requiredLength } = order;

  // Remnant Size Match Check (Hinglish: "phelee inventory m check karne ke is size ka koi hai ki nhi")
  const isRemnant = roll.isReuse === true || (roll.id && (roll.id.startsWith('REUSE-') || roll.id.startsWith('INV-') || roll.id.startsWith('SCRAP-')));
  if (isRemnant) {
    const widthDiff = roll.fullWidth - requiredWidth;
    const lengthDiff = roll.fullLength - requiredLength;

    // Perfect Match: within 2cm in both dimensions
    if (Math.abs(widthDiff) < 0.02 && Math.abs(lengthDiff) < 0.02) {
      score += 20000; // Put at the absolute top
      reasons.push("PERFECT REMNANT MATCH (Zero Waste)");
    }
    // Close Match: within 10% extra width and length
    else if (widthDiff >= 0 && widthDiff < 0.1 * requiredWidth && lengthDiff >= 0 && lengthDiff < 0.1 * requiredLength) {
      score += 10000;
      reasons.push("EXACT SIZE REMNANT MATCH");
    }
    // Close length match with exact width
    else if (Math.abs(widthDiff) < 0.02 && lengthDiff >= 0 && lengthDiff < 0.5) {
      score += 8000;
      reasons.push("NEAR-PERFECT REMNANT MATCH");
    }
  }

  // 1. Position Penalty (Heavy preference for the start of the roll)
  // Every meter further into the roll reduces the score
  score -= (x * 100);

  // 2. Edge Alignment (Top or Bottom)
  const hitsTopEdge = Math.abs(y) < 0.01;
  const hitsBottomEdge = Math.abs((y + requiredWidth) - roll.fullWidth) < 0.01;

  if (hitsTopEdge) {
    score += 1005; // Slight preference for top edge alignment
    reasons.push("Top Edge Aligned");
  } else if (hitsBottomEdge) {
    score += 1000;
    reasons.push("Bottom Edge Aligned");
  }

  // 3. Perfect Width Match (The most "manageable" cut)
  if (hitsTopEdge && hitsBottomEdge) {
    score += 3000;
    reasons.push("Full Width Cut");
  }

  // 4. Snugness (Touching existing cuts)
  let touchesExisting = false;
  let alignmentBonus = 0;

  roll.cuts.forEach(cut => {
    const touchesX = Math.abs(x - (cut.x + cut.length)) < 0.01 || Math.abs((x + requiredLength) - cut.x) < 0.01;
    const touchesY = Math.abs(y - (cut.y + cut.width)) < 0.01 || Math.abs((y + requiredWidth) - cut.y) < 0.01;

    const xOverlap = Math.max(0, Math.min(x + requiredLength, cut.x + cut.length) - Math.max(x, cut.x));
    const yOverlap = Math.max(0, Math.min(y + requiredWidth, cut.y + cut.width) - Math.max(y, cut.y));

    if ((touchesX && yOverlap > 0) || (touchesY && xOverlap > 0)) {
      touchesExisting = true;
      score += 500;

      // Bonus for perfect alignment with existing cut edges (keeps remnants rectangular)
      if (Math.abs(y - cut.y) < 0.01 || Math.abs((y + requiredWidth) - (cut.y + cut.width)) < 0.01) {
        alignmentBonus += 300;
      }
    }
  });

  if (touchesExisting) {
    reasons.push("Snug Fit");
    score += alignmentBonus;
    if (alignmentBonus > 0) reasons.push("Rectangular Remnant");
  }

  // 5. Scrap Risk (Avoid leaving thin strips)
  const topGap = y;
  const bottomGap = roll.fullWidth - (y + requiredWidth);
  const MIN_MANAGEABLE_WIDTH = 0.3; // 300mm is usually the minimum usable belt width

  if ((topGap > 0.01 && topGap < MIN_MANAGEABLE_WIDTH) ||
    (bottomGap > 0.01 && bottomGap < MIN_MANAGEABLE_WIDTH)) {
    score -= 5000;
    reasons.push("CRITICAL: Scrap Risk");
  }

  // 6. Remnant Usage Bonus
  // Prioritize remnants or rolls with existing cuts over fresh master rolls
  // to encourage utilizing available stock before starting a fresh roll.
  const isRemnantOrOpen = isRemnant || roll.cuts.length > 0;
  if (isRemnantOrOpen) {
    score += 8000;
    reasons.push("Remnant Priority");
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join(" + ") : "Standard Fit",
    wastage: requiredWidth * requiredLength
  };
};

export const isSpaceAvailable = (roll: Roll, x: number, y: number, w: number, l: number): boolean => {
  if (x < 0 || y < 0 || (x + l) > roll.fullLength + 0.01 || (y + w) > roll.fullWidth + 0.01) return false;

  return !roll.cuts.some(cut => {
    const collision = !(
      x + l <= cut.x + 0.001 ||
      x >= cut.x + cut.length - 0.001 ||
      y + w <= cut.y + 0.001 ||
      y >= cut.y + cut.width - 0.001
    );
    return collision;
  });
};
