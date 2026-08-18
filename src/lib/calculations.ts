import { ProfitRange, BOMItem } from '../types';

const evaluateFormula = (
  formula: string, 
  L: number, 
  W: number, 
  variables: any[] = [], 
  costingData: any = {}, 
  activeRate: number = 0
) => {
  try {
    if (!formula) return 0;
    
    let expr = formula.replace(/\s/g, '').toUpperCase();
    
    // Sort custom variables by length descending to prevent substring replace conflicts
    const sortedVars = [...(variables || [])].sort((a, b) => b.symbol.length - a.symbol.length);
    
    // Replace custom variables
    sortedVars.forEach(v => {
      let val = 0;
      if (v.mappedField === 'length') val = L;
      else if (v.mappedField === 'width') val = W;
      else if (v.mappedField === 'rate') val = activeRate;
      else if (v.mappedField === 'holesH') {
        const hDist = parseFloat(costingData.holeDistHorizontal) || 0;
        const hSize = parseFloat(costingData.holeSize) || 0;
        const pitch = hDist + hSize;
        const lMm = L * 1000;
        val = pitch > 0 ? (Math.floor(lMm / pitch) + 1) : (hDist > 0 ? Math.floor(lMm / hDist) : 0);
      }
      else if (v.mappedField === 'holesV') {
        const vDist = parseFloat(costingData.holeDistVertical) || 0;
        const hSize = parseFloat(costingData.holeSize) || 0;
        const pitch = vDist + hSize;
        const wMm = W * 1000;
        val = pitch > 0 ? (Math.floor(wMm / pitch) + 1) : (vDist > 0 ? Math.floor(wMm / vDist) : 0);
      }
      else if (v.mappedField === 'totalHoles') {
        const hDist = parseFloat(costingData.holeDistHorizontal) || 0;
        const vDist = parseFloat(costingData.holeDistVertical) || 0;
        const hSize = parseFloat(costingData.holeSize) || 0;
        const pitchH = hDist + hSize;
        const pitchV = vDist + hSize;
        const lMm = L * 1000;
        const wMm = W * 1000;
        const holesH = pitchH > 0 ? (Math.floor(lMm / pitchH) + 1) : (hDist > 0 ? Math.floor(lMm / hDist) : 0);
        const holesV = pitchV > 0 ? (Math.floor(wMm / pitchV) + 1) : (vDist > 0 ? Math.floor(wMm / vDist) : 0);
        val = holesH * holesV;
      }
      else {
        val = parseFloat(costingData[v.mappedField]) || 0;
      }
      
      const escapedSymbol = v.symbol.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp('\\b' + escapedSymbol + '\\b', 'g');
      expr = expr.replace(regex, `(${val})`);
    });
    
    // Fallback default variables
    const P = 2 * ((L || 0) + (W || 0));
    const defaultVars = [
      { symbol: 'L', value: L },
      { symbol: 'W', value: W },
      { symbol: 'P', value: P },
      { symbol: 'R', value: activeRate }
    ];
    
    defaultVars.forEach(v => {
      const regex = new RegExp('\\b' + v.symbol + '\\b', 'g');
      expr = expr.replace(regex, `(${v.value})`);
    });
    
    const cleanExpr = expr.replace(/\s/g, '');
    if (!/^[0-9\.\+\-\*\/\(\)]+$/.test(cleanExpr)) {
      console.warn('Formula contains invalid symbols after substitution:', cleanExpr);
      return 0;
    }
    
    const result = Function(`"use strict"; return (${cleanExpr})`)();
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
  let totalHoles = 0;
  let holesCost = 0;

  if (customBOM && customBOM.length > 0) {
    // Custom Formula Calculation
    customBOM.forEach(item => {
      const activeRate = selectedRates[item.id] !== undefined ? selectedRates[item.id] : (item.rate || 0);
      const parentId = (item as any)._originalParentId || item.id;
      
      // Get the name of the currently selected options for this item to filter variables
      const activeOptionNames: string[] = [];
      if (item.name) {
        const cleanName = (item as any)._formationName || item.name.split(' › ')[0].trim();
        activeOptionNames.push(cleanName);
        activeOptionNames.push(item.name.trim());
      }
      if (data.selectedBOMOptions) {
        const rawSel = data.selectedBOMOptions[parentId] !== undefined 
          ? data.selectedBOMOptions[parentId] 
          : data.selectedBOMOptions[item.id];
        const selectedOptIndices: number[] = Array.isArray(rawSel)
          ? rawSel
          : rawSel !== undefined ? [rawSel] : [];
        if (item.options && item.options.length > 0) {
          selectedOptIndices.forEach((optIdx) => {
            const opt = item.options[optIdx];
            if (opt && opt.name) {
              activeOptionNames.push(opt.name.trim());
            }
          });
        }
      }

      // Filter variables: they must either have no forOptionName, or their forOptionName must match one of the active options
      const filteredVariables = (item.variables || []).filter((v: any) => {
        if (!v.forOptionName) return true;
        return activeOptionNames.includes(v.forOptionName.trim());
      });

      // Determine if formula contains rate symbol (default 'R' or custom variable mapped to 'rate')
      const rateSymbols = ['R', ...filteredVariables
        .filter((v: any) => v.mappedField === 'rate')
        .map((v: any) => v.symbol.toUpperCase())];
      const formulaUpper = (item.formula || '').toUpperCase();
      const hasRateInFormula = rateSymbols.some(symbol => {
        const regex = new RegExp('\\b' + symbol.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b');
        return regex.test(formulaUpper);
      });

      // Check if this BOM item or its selected sub-category option requires hole data based on custom variables mapped to hole fields
      let itemRequiresHole = false;
      if (filteredVariables.length > 0) {
        let activeFormula = item.formula || '';
        if (data.selectedBOMOptions) {
          const rawSel = data.selectedBOMOptions[parentId] !== undefined 
            ? data.selectedBOMOptions[parentId] 
            : data.selectedBOMOptions[item.id];
          const selectedOptIndices: number[] = Array.isArray(rawSel)
            ? rawSel
            : rawSel !== undefined ? [rawSel] : [];
          if (item.options && item.options.length > 0) {
            selectedOptIndices.forEach((optIdx) => {
              const opt = item.options[optIdx];
              if (opt && opt.formula) {
                activeFormula += ' ' + opt.formula;
              }
            });
          }
        }
        const holeFields = ['holeSize', 'holeDistHorizontal', 'holeDistVertical', 'pricePerHole', 'totalHoles', 'holesH', 'holesV'];
        itemRequiresHole = filteredVariables.some((v: any) => {
          const escaped = v.symbol.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp('\\b' + escaped + '\\b', 'i');
          return regex.test(activeFormula) && holeFields.includes(v.mappedField);
        });
      }

      // If item requires holes and data is provided, use hole area dimensions as target L & W (converted to meters)
      const targetL = itemRequiresHole && data.holeLength ? (parseFloat(data.holeLength) / 1000) : lMtr;
      const targetW = itemRequiresHole && data.holeWidth ? (parseFloat(data.holeWidth) / 1000) : wMtr;

      let consumption = 0;
      let totalCost = 0;

      if (hasRateInFormula) {
        // Formula calculates cost directly (since rate is in the formula)
        const costVal = evaluateFormula(item.formula || '', targetL, targetW, filteredVariables, { ...data, ...config?.constants }, activeRate);
        totalCost = Math.round(costVal);
        consumption = activeRate > 0 ? (totalCost / activeRate) : evaluateFormula(item.formula || '', targetL, targetW, filteredVariables, { ...data, ...config?.constants }, 1);
      } else {
        // Formula calculates consumption quantity
        consumption = evaluateFormula(item.formula || '', targetL, targetW, filteredVariables, { ...data, ...config?.constants }, activeRate);
        
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
        
        totalCost = Math.round(consumption * activeRate);
      }
      
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
      unit: 'pcs',
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
  
  let resolvedClientMargin = 0;
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
