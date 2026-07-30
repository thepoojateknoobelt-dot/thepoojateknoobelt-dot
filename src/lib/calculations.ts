import { ProfitRange, BOMItem } from '../types';

const evaluateFormula = (formula: string, L: number, W: number) => {
  try {
    if (!formula) return 0;
    // Replace L and W with values, ensuring they are treated as tokens
    // We use a regex with word boundaries or just replace if they are single letters
    const sanitized = formula.toUpperCase().replace(/\s/g, '');
    if (!/^[0-9LWP\.\+\-\*\/\(\)]+$/.test(sanitized)) return 0;
    
    const P = 2 * ((L || 0) + (W || 0));
    
    const expr = sanitized
      .replace(/L/g, `(${L || 0})`)
      .replace(/W/g, `(${W || 0})`)
      .replace(/P/g, `(${P})`);
    
    const result = Function(`"use strict"; return (${expr})`)();
    return isNaN(result) ? 0 : result;
  } catch (e) {
    console.error('Formula Error:', formula, e);
    return 0;
  }
};

export const toMeters = (val: number, u: string) => {
  if (!u) return val;
  const unit = u.toLowerCase();
  if (unit === 'mm' || unit === 'millimeters') return val / 1000;
  if (unit === 'ft' || unit === 'feet') return val * 0.3048;
  if (unit === 'in' || unit === 'inch' || unit === 'inches') return val * 0.0254;
  if (unit === 'mtr' || unit === 'm' || unit === 'meter' || unit === 'meters') return val;
  return val;
};

export const calculateCosting = (data: any, config: any, clientProfitRanges: ProfitRange[] = [], customBOM: BOMItem[] = [], selectedRates: Record<string, number> = {}) => {
  const { length, width, jointType, tapeType, lengthUnit, widthUnit, manualPackingCost, manualProfitMargin } = data;
  const { rates, constants, jointTypes, tapeTypes } = config;

  const lMtr = toMeters(parseFloat(length), lengthUnit);
  const wMtr = toMeters(parseFloat(width), widthUnit);

  let breakdown: any = {};
  let subtotal = 0;
  let packingCost = 0;

  if (customBOM && customBOM.length > 0) {
    // Custom Formula Calculation
    customBOM.forEach(item => {
      let consumption = evaluateFormula(item.formula || '', lMtr, wMtr);
      
      // Convert consumption from Meters/SqM to the item's specified unit
      const u = (item.unit || '').toLowerCase();
      if (u === 'ft' || u === 'feet') consumption = consumption / 0.3048;
      else if (u === 'in' || u === 'inch' || u === 'inches') consumption = consumption / 0.0254;
      else if (u === 'mm' || u === 'millimeters') consumption = consumption * 1000;
      else if (u.includes('sq')) {
        if (u.includes('ft') || u.includes('feet')) consumption = consumption / (0.3048 * 0.3048);
        else if (u.includes('in') || u.includes('inch') || u.includes('inches')) consumption = consumption / (0.0254 * 0.0254);
        else if (u.includes('mm') || u.includes('millimeters')) consumption = consumption * (1000 * 1000);
      }

      const activeRate = selectedRates[item.id] || item.rate;
      const totalCost = Math.round(consumption * activeRate);
      
      breakdown[item.name] = { 
        consumption: consumption, 
        rate: activeRate, 
        cost: totalCost,
        unit: item.unit
      };
      subtotal += totalCost;
    });

    // Manual/Static Packing Cost - Removed from Subtotal
    packingCost = Math.round(manualPackingCost !== undefined ? parseFloat(manualPackingCost) : rates.packing);
    breakdown['Packing'] = { consumption: 1.00, rate: manualPackingCost !== undefined ? manualPackingCost : rates.packing, cost: packingCost };

  } else {
    // Legacy/Hardcoded Calculation (if no BOM defined)
    const meshSqm = lMtr * wMtr;
    const redTapeMtr = 2 * lMtr;
    const fepMtr = 2 * lMtr;
    const threadGm = wMtr * 10 * 4 * 2; 
    const pinMtr = 2 * wMtr * 1.05;

    const selectedJoint = jointTypes?.find?.((j: any) => j.name === jointType) || null;
    const jointMtr = (selectedJoint?.multiplier || 0) * wMtr;
    const selectedTape = tapeTypes?.find?.((t: any) => t.name === tapeType) || null;
    const tapeCost = Math.round(redTapeMtr * (selectedTape?.rate || 0));
    const jointCost = Math.round(jointMtr * (selectedJoint?.rate || 0));
    packingCost = Math.round(manualPackingCost !== undefined ? parseFloat(manualPackingCost) : rates.packing);

    const meshCost = Math.round(meshSqm * rates.mesh);
    const fepCost = Math.round(fepMtr * rates.fep);
    const threadCost = Math.round(threadGm * rates.thread);
    const pinCost = Math.round(pinMtr * rates.pin);

    subtotal = Math.round(meshCost + tapeCost + fepCost + threadCost + pinCost + jointCost);
    
    breakdown = {
      mesh: { consumption: meshSqm, rate: rates.mesh, cost: meshCost },
      tape: { consumption: redTapeMtr, name: tapeType, rate: selectedTape?.rate || 0, cost: tapeCost },
      fep: { consumption: fepMtr, rate: rates.fep, cost: fepCost },
      thread: { consumption: threadGm, rate: rates.thread, cost: threadCost },
      pin: { consumption: pinMtr, rate: rates.pin, cost: pinCost },
      joint: { consumption: jointMtr, name: jointType, rate: selectedJoint?.rate || 0, cost: jointCost },
      packing: { consumption: 1, rate: manualPackingCost !== undefined ? manualPackingCost : rates.packing, cost: packingCost },
    };
  }

  // Holes Layout Spacing and Costing Calculation
  const hasHoles = !!data.hasHoles;
  let totalHoles = 0;
  let holesCost = 0;
  if (hasHoles) {
    const lMm = lMtr * 1000;
    const wMm = wMtr * 1000;
    const hDist = parseFloat(data.holeDistHorizontal) || 0;
    const vDist = parseFloat(data.holeDistVertical) || 0;
    const holesH = hDist > 0 ? Math.floor(lMm / hDist) : 0;
    const holesV = vDist > 0 ? Math.floor(wMm / vDist) : 0;
    totalHoles = holesH * holesV;
    const ratePerHole = parseFloat(data.pricePerHole) || 0;
    holesCost = Math.round(totalHoles * ratePerHole);

    breakdown['Holes'] = {
      consumption: totalHoles,
      rate: ratePerHole,
      cost: holesCost,
      unit: 'holes',
      details: {
        holeSize: parseFloat(data.holeSize) || 0,
        holeDistHorizontal: hDist,
        holeDistVertical: vDist,
        holesH,
        holesV
      }
    };
    subtotal += holesCost;
  }

  const selectedCategory = config?.beltTypes?.find?.((t: any) => t.name === data.beltType) || null;
  
  // Single GST rate: category-level overrides global constants
  const categoryGst = selectedCategory?.gst !== undefined && selectedCategory.gst !== null
    ? Number(selectedCategory.gst)
    : null;

  const applicablePurchaseGst = categoryGst !== null ? categoryGst : constants.purchaseGst;
  const applicableSaleGst     = categoryGst !== null ? categoryGst : constants.saleGst;

  const purchaseGstAmount = Math.round(subtotal * (applicablePurchaseGst / 100));
  const totalWithPurchaseGst = Math.round(subtotal + purchaseGstAmount);
  
  const applicableFixCost = selectedCategory?.fixCost !== undefined ? selectedCategory.fixCost : constants.fixCost;
  
  const fixCostAmount = Math.round(totalWithPurchaseGst * (applicableFixCost / 100));
  const totalWithFixCost = Math.round(totalWithPurchaseGst + fixCostAmount);
  
  let resolvedClientMargin = constants.defaultProfit;
  if (Array.isArray(clientProfitRanges) && clientProfitRanges.length > 0) {
    const applicableRange = clientProfitRanges?.find?.(r => 
      lMtr >= r.minLength && (r.maxLength === null || lMtr < r.maxLength)
    ) || null;
    if (applicableRange) {
      resolvedClientMargin = applicableRange.margin;
    }
  }

  const profitMargin = manualProfitMargin !== undefined ? parseFloat(manualProfitMargin) : resolvedClientMargin;
  const profitAmount = Math.round(totalWithFixCost * (profitMargin / 100));
  const totalWithProfit = Math.round(totalWithFixCost + profitAmount);
  
  const saleGstAmount = Math.round(totalWithProfit * (applicableSaleGst / 100));
  const finalTotal = Math.round(totalWithProfit + saleGstAmount + packingCost);

  return {
    breakdown,
    summary: {
      subtotal,
      purchaseGst: purchaseGstAmount,
      purchaseGstPercent: applicablePurchaseGst,
      totalWithPurchaseGst,
      fixCost: fixCostAmount,
      fixCostPercentage: applicableFixCost,
      totalWithFixCost,
      profit: profitAmount,
      profitMarginUsed: profitMargin,
      totalWithProfit,
      saleGst: saleGstAmount,
      saleGstPercent: applicableSaleGst,
      gstPercent: categoryGst !== null ? categoryGst : null, // applied category GST or null if global
      packingCost,
      finalTotal,
      hasHoles,
      totalHoles,
      pricePerHole: hasHoles ? (parseFloat(data.pricePerHole) || 0) : 0,
      holesCost
    }
  };
};
