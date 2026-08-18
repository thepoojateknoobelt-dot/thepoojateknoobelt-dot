import React, { useRef, useState } from 'react';
import { Roll, Cut, Unit } from '../types';
import { isSpaceAvailable } from '../services/optimizationEngine';
import { Box, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { getShortRollId, getResolvedRollCuts } from '../utils';

interface RollVisualizerProps {
  roll: Roll;
  unit?: Unit;
  onSelectCut?: (cut: Cut) => void;
  suggestedPlacement?: { x: number; y: number; width: number; length: number } | null;
  manualMode?: boolean;
  manualDimensions?: { width: number; length: number } | null;
  onManualPlacementChange?: (pos: { x: number; y: number } | null) => void;
  onManualPlacementConfirm?: (pos: { x: number; y: number }) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onMaximize?: () => void;
  height?: string;
  hideTitle?: boolean;
  noBorder?: boolean;
  allRolls?: Roll[];
}

const CONVERSIONS: Record<Unit, number> = {
  'm': 1,
  'cm': 100,
  'mm': 1000,
  'ft': 3.28084,
  'in': 39.3701
};

const RollVisualizer: React.FC<RollVisualizerProps> = ({ 
  roll, 
  unit = 'm',
  onSelectCut,
  suggestedPlacement, 
  manualMode, 
  manualDimensions,
  onManualPlacementChange,
  onManualPlacementConfirm,
  isExpanded = true,
  onToggleExpand,
  onMaximize,
  height = 'h-[400px]',
  hideTitle = false,
  noBorder = false,
  allRolls
}) => {
  const [zoom, setZoom] = useState(0.8);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
  const [isValidPos, setIsValidPos] = useState(false);

  const SCALE = 35; // 1m = 35px
  const viewWidth = roll.fullLength * SCALE;
  const viewHeight = roll.fullWidth * SCALE;
  const conv = CONVERSIONS[unit];
  const isReuse = !!(roll.isReuse || (roll.id && (roll.id.toString().startsWith('REUSE-') || roll.id.toString().startsWith('INV-') || roll.id.toString().startsWith('SCRAP-'))));
  const RULER_SIZE = 55; // wider for clean Y-axis labels

  const resolvedCuts = React.useMemo(() => {
    return getResolvedRollCuts(roll, allRolls || []);
  }, [roll.cuts, roll.id, allRolls]);



  // Auto-scroll to suggested placement
  React.useEffect(() => {
    if (suggestedPlacement && containerRef.current) {
      const scrollX = (suggestedPlacement.x * SCALE + RULER_SIZE) * zoom - 100;
      const scrollY = (suggestedPlacement.y * SCALE + RULER_SIZE) * zoom - 100;
      containerRef.current.scrollTo({
        left: Math.max(0, scrollX),
        top: Math.max(0, scrollY),
        behavior: 'smooth'
      });
    }
  }, [suggestedPlacement, zoom]);

  const getSVGCoords = (e: React.MouseEvent): { x: number; y: number } | null => {
    if (!svgRef.current || !manualDimensions) return null;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    
    // Convert client coordinates to SVG user units, taking zoom into account
    const unscaledX = (e.clientX - rect.left) / zoom;
    const unscaledY = (e.clientY - rect.top) / zoom;
    
    // Scale back to raw meters after subtracting ruler size
    const rawX = (unscaledX - RULER_SIZE) / SCALE;
    const rawY = (unscaledY - RULER_SIZE) / SCALE;
    
    let x = rawX;
    let y = rawY;
    
    // Snapping points for X
    const snapXPoints = [0, roll.fullLength - manualDimensions.length];
    roll.cuts.forEach(cut => {
      snapXPoints.push(cut.x);
      snapXPoints.push(cut.x + cut.length);
      snapXPoints.push(cut.x - manualDimensions.length);
    });
    
    // Snapping points for Y
    const snapYPoints = [0, roll.fullWidth - manualDimensions.width];
    roll.cuts.forEach(cut => {
      snapYPoints.push(cut.y);
      snapYPoints.push(cut.y + cut.width);
      snapYPoints.push(cut.y - manualDimensions.width);
    });
    
    // Threshold for magnetic snapping: 0.15 meters (15 cm)
    const SNAP_THRESHOLD = 0.15;
    
    let closestX = x;
    let minDiffX = Infinity;
    snapXPoints.forEach(pt => {
      const diff = Math.abs(x - pt);
      if (diff < minDiffX) {
        minDiffX = diff;
        closestX = pt;
      }
    });
    
    if (minDiffX <= SNAP_THRESHOLD) {
      x = closestX;
    } else {
      // Snap to 1mm grid
      x = Math.round(x * 1000) / 1000;
    }
    
    let closestY = y;
    let minDiffY = Infinity;
    snapYPoints.forEach(pt => {
      const diff = Math.abs(y - pt);
      if (diff < minDiffY) {
        minDiffY = diff;
        closestY = pt;
      }
    });
    
    if (minDiffY <= SNAP_THRESHOLD) {
      y = closestY;
    } else {
      // Snap to 1mm grid
      y = Math.round(y * 1000) / 1000;
    }
    
    // Constrain coordinates to roll boundaries
    x = Math.max(0, Math.min(roll.fullLength - manualDimensions.length, x));
    y = Math.max(0, Math.min(roll.fullWidth - manualDimensions.width, y));
    
    return { x, y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!manualMode || !manualDimensions) return;
    const coords = getSVGCoords(e);
    if (!coords) return;
    
    setMousePos(coords);
    const valid = isSpaceAvailable(roll, coords.x, coords.y, manualDimensions.width, manualDimensions.length);
    setIsValidPos(valid);
    
    if (onManualPlacementChange) {
      onManualPlacementChange(valid ? coords : null);
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setIsValidPos(false);
    if (onManualPlacementChange) {
      onManualPlacementChange(null);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!manualMode || !mousePos) return;
    if (manualDimensions && isSpaceAvailable(roll, mousePos.x, mousePos.y, manualDimensions.width, manualDimensions.length)) {
      if (onManualPlacementConfirm) {
        onManualPlacementConfirm(mousePos);
      }
    } else {
      alert('Cut cannot be placed here — space is either occupied or dimensions do not fit.');
    }
  };

  // Determine tick steps in the display unit
  let minorStepUnit = 0.1;
  let majorStepUnit = 1.0;
  
  if (unit === 'cm') {
    minorStepUnit = 10;
    majorStepUnit = 100;
  } else if (unit === 'mm') {
    minorStepUnit = 100;
    majorStepUnit = 1000;
  } else if (unit === 'ft') {
    minorStepUnit = 0.5;
    majorStepUnit = 2.0;
  } else if (unit === 'in') {
    minorStepUnit = 6;
    majorStepUnit = 12;
  }

  // Adjust major step based on total length in display units
  const totalDisplayLength = roll.fullLength * conv;
  if (totalDisplayLength <= 3) {
    majorStepUnit = minorStepUnit * 5; // e.g. 0.5m instead of 1m
  } else if (totalDisplayLength > 30) {
    majorStepUnit = majorStepUnit * 5; // e.g. 5m instead of 1m
  }

  const maxDisplayVal = Math.floor(totalDisplayLength / minorStepUnit) * minorStepUnit;
  const minorTicks = Array.from(
    { length: Math.round(maxDisplayVal / minorStepUnit) + 1 },
    (_, i) => Math.round(i * minorStepUnit * 1000) / 1000
  );

  // Y-axis steps
  let minorStepUnitY = 0.1;
  let majorStepUnitY = 1.0;
  
  if (unit === 'cm') {
    minorStepUnitY = 10;
    majorStepUnitY = 100;
  } else if (unit === 'mm') {
    minorStepUnitY = 100;
    majorStepUnitY = 1000;
  } else if (unit === 'ft') {
    minorStepUnitY = 0.5;
    majorStepUnitY = 1.0;
  } else if (unit === 'in') {
    minorStepUnitY = 6;
    majorStepUnitY = 12;
  }

  const totalDisplayWidth = roll.fullWidth * conv;
  if (totalDisplayWidth <= 3) {
    majorStepUnitY = minorStepUnitY * 5; // e.g. 0.5m
  }

  const maxDisplayValY = Math.floor(totalDisplayWidth / minorStepUnitY) * minorStepUnitY;
  const minorTicksY = Array.from(
    { length: Math.round(maxDisplayValY / minorStepUnitY) + 1 },
    (_, i) => Math.round(i * minorStepUnitY * 1000) / 1000
  );

  const formatVal = (m: number) => {
    const val = m * conv;
    if (unit === 'm' || unit === 'ft' || unit === 'in') {
      return Number(val.toFixed(2)).toString();
    }
    return Number(val.toFixed(1)).toString();
  };

  const isSuggestedValid = suggestedPlacement 
    ? isSpaceAvailable(roll, suggestedPlacement.x, suggestedPlacement.y, suggestedPlacement.width, suggestedPlacement.length)
    : true;

  return (
    <div id={`roll-visualizer-${roll.id}`} className={`flex flex-col gap-4 w-full ${(height.includes('full') || height.includes('1') || height.includes('vh')) ? 'flex-grow h-full' : ''} ${noBorder ? 'p-0 bg-transparent border-0 shadow-none' : 'p-6 rounded-3xl border bg-white border-slate-200 shadow-sm'} ${manualMode && !noBorder ? 'bg-blue-50/50 border-blue-400 shadow-xl' : ''} transition-all duration-300`}>
      <div className={`flex items-center px-2 ${hideTitle ? 'justify-end' : 'justify-between'}`}>
        {!hideTitle && (
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-lg shadow-slate-200">
               <Box size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 italic uppercase tracking-tight" title={roll.id}>
                Roll {getShortRollId(roll.id)} 
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full not-italic font-black tracking-widest ${isReuse ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                  {isReuse ? 'REUSE' : 'FRESH'}
                </span>
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full not-italic font-black tracking-widest ${roll.cuts.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                  {roll.cuts.length > 0 ? 'REMNANT' : 'FULL'}
                </span>
                {roll.status === 'refused' && (
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full not-italic font-black tracking-widest bg-rose-100 text-rose-700">
                    REFUSED
                  </span>
                )}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{roll.materialType}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          {manualMode && (
            <span className="text-[9px] font-black text-blue-600 bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 uppercase tracking-wider animate-pulse">
              ✦ Click to Place
            </span>
          )}
          {isExpanded && (
            <div className="flex bg-slate-100 border border-slate-200 rounded-2xl p-1.5">
              <button onClick={() => setZoom(prev => Math.max(0.2, prev - 0.2))} className="w-8 h-8 flex items-center justify-center text-xs hover:bg-white rounded-xl font-black transition-all">-</button>
              <div className="px-5 text-[10px] font-mono font-black flex items-center text-slate-600">{(zoom * 100).toFixed(0)}%</div>
              <button onClick={() => setZoom(prev => Math.min(2, prev + 0.2))} className="w-8 h-8 flex items-center justify-center text-xs hover:bg-white rounded-xl font-black transition-all">+</button>
            </div>
          )}
          {onToggleExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="p-2 hover:bg-slate-150 active:scale-95 bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer text-slate-500 hover:text-slate-800"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
          {onMaximize && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMaximize();
              }}
              className="p-2 hover:bg-slate-150 active:scale-95 bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer text-slate-500 hover:text-slate-800"
              title="Fullscreen View"
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div 
          ref={containerRef}
          className={`w-full ${height} ${noBorder ? 'border border-slate-200 rounded-2xl shadow-none' : 'border-4 border-white shadow-inner rounded-3xl'} overflow-auto relative transition-all duration-700 ${manualMode ? 'bg-blue-50/30 border-blue-300 cursor-crosshair' : 'bg-slate-50'}`}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={() => { setMousePos(null); setIsValidPos(false); }}
      >
        <div style={{ width: (viewWidth + RULER_SIZE + 45) * zoom, height: (viewHeight + RULER_SIZE + 40) * zoom, position: 'relative' }}>
          <svg 
            ref={svgRef}
            width={(viewWidth + RULER_SIZE + 45) * zoom} 
            height={(viewHeight + RULER_SIZE + 40) * zoom} 
            viewBox={`0 0 ${viewWidth + RULER_SIZE + 45} ${viewHeight + RULER_SIZE + 40}`}
            className="absolute top-0 left-0 roll-layout-svg"
          >
            <defs>
              <pattern id="suggested-pattern-auto" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="14" stroke="#10b981" strokeWidth="3.5" opacity="0.35" />
              </pattern>
              <pattern id="suggested-pattern-manual" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="14" stroke="#3b82f6" strokeWidth="3.5" opacity="0.35" />
              </pattern>
              <pattern id="suggested-pattern-invalid" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="14" stroke="#ef4444" strokeWidth="3.5" opacity="0.35" />
              </pattern>
            </defs>
            <g transform={`translate(${RULER_SIZE}, 0)`}>
              <rect width={viewWidth} height={RULER_SIZE} fill="#f8fafc" stroke="#e2e8f0" />
              {minorTicks.map(t => {
                const isMajor = Math.abs(t % majorStepUnit) < 0.01 || Math.abs((t % majorStepUnit) - majorStepUnit) < 0.01;
                const isMedium = !isMajor && (Math.abs(t % (majorStepUnit / 2)) < 0.01 || Math.abs((t % (majorStepUnit / 2)) - (majorStepUnit / 2)) < 0.01);
                
                let tickHeight = 6;
                if (isMajor) tickHeight = 15;
                else if (isMedium) tickHeight = 10;
                
                const xPos = (t / conv) * SCALE;
                return (
                  <g key={`t-${t}`} transform={`translate(${xPos}, 0)`}>
                    <line y1={RULER_SIZE - tickHeight} y2={RULER_SIZE} stroke="#cbd5e1" strokeWidth={isMajor ? 1.5 : 1} />
                    {isMajor && (() => {
                      const isLast = xPos + 30 > viewWidth && t > 0;
                      return (
                        <text
                          x={isLast ? -4 : 4}
                          y="20"
                          fontSize="9.5"
                          fill="#64748b"
                          fontWeight="900"
                          textAnchor={isLast ? "end" : "start"}
                        >
                          {formatVal(t / conv)}{unit}
                        </text>
                      );
                    })()}
                  </g>
                );
              })}
              {/* Live hover position line and label on the ruler */}
              {mousePos && (
                <g transform={`translate(${mousePos.x * SCALE}, 0)`} style={{ pointerEvents: 'none' }}>
                  <line y1="0" y2={RULER_SIZE} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" />
                  <rect x="-24" y="2" width="48" height="13" rx="3" fill="#3b82f6" />
                  <text x="0" y="11" fontSize="8" fill="white" fontWeight="black" textAnchor="middle">
                    {formatVal(mousePos.x)}{unit}
                  </text>
                </g>
              )}
            </g>

            {/* X-axis (LENGTH) axis label */}
            <g transform={`translate(${RULER_SIZE}, 0)`}>
              <text
                x={viewWidth / 2}
                y={12}
                textAnchor="middle"
                fontSize="8"
                fontWeight="900"
                fill="#6366f1"
                letterSpacing="2"
              >
                ← LENGTH →
              </text>
            </g>

            <g transform={`translate(0, ${RULER_SIZE})`}>
              <rect width={RULER_SIZE} height={viewHeight} fill="#f8fafc" stroke="#e2e8f0" />
              {minorTicksY.map(t => {
                const isMajor = Math.abs(t % majorStepUnitY) < 0.01 || Math.abs((t % majorStepUnitY) - majorStepUnitY) < 0.01;
                const isMedium = !isMajor && (Math.abs(t % (majorStepUnitY / 2)) < 0.01 || Math.abs((t % (majorStepUnitY / 2)) - (majorStepUnitY / 2)) < 0.01);
                
                let tickWidth = 6;
                if (isMajor) tickWidth = 15;
                else if (isMedium) tickWidth = 10;
                
                const yPos = (t / conv) * SCALE;
                return (
                  <g key={`wt-${t}`} transform={`translate(0, ${yPos})`}>
                    <line x1={RULER_SIZE - tickWidth} x2={RULER_SIZE} stroke="#cbd5e1" strokeWidth={isMajor ? 1.5 : 1} />
                    {isMajor && (
                      <text
                        x={RULER_SIZE - 6}
                        y={t === 0 ? 11 : 5}
                        fontSize="9"
                        fill="#64748b"
                        fontWeight="700"
                        textAnchor="end"
                      >
                        {formatVal(t / conv)}{unit}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* Live hover position line and label on the Y-axis ruler */}
              {mousePos && (
                <g transform={`translate(0, ${mousePos.y * SCALE})`} style={{ pointerEvents: 'none' }}>
                  <line x1="0" x2={RULER_SIZE} y1="0" y2="0" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" />
                  <rect x="2" y="-8" width="40" height="13" rx="3" fill="#3b82f6" />
                  <text x="22" y="1.5" fontSize="8" fill="white" fontWeight="black" textAnchor="middle">
                    {formatVal(mousePos.y)}{unit}
                  </text>
                </g>
              )}
              {/* Rotated WIDTH axis label */}
              <text
                x={0}
                y={viewHeight / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="8"
                fontWeight="900"
                fill="#6366f1"
                letterSpacing="2"
                transform={`rotate(-90, 10, ${viewHeight / 2})`}
              >
                ↑ WIDTH ↑
              </text>
            </g>

            <g transform={`translate(${RULER_SIZE}, ${RULER_SIZE})`}>
              <rect width={viewWidth} height={viewHeight} fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />

              {resolvedCuts.map((cut) => {
                const rectWidthPx = cut.length * SCALE;
                const rectHeightPx = cut.width * SCALE;
                const hasSoNumber = !!cut.soNumber;
                const minHeightNeeded = hasSoNumber ? 34 : 24;
                const minWidthNeeded = 50;
                const showText = rectHeightPx >= minHeightNeeded && rectWidthPx >= minWidthNeeded;
                const dynamicStrokeWidth = Math.max(0.5, Math.min(2, rectHeightPx * 0.15));
                const dynamicRx = Math.max(0.5, Math.min(4, rectHeightPx * 0.2));

                return (
                  <g 
                    key={cut.id} 
                    onClick={(e) => {
                      // Stop propagation so clicking on a cut doesn't trigger manual placement on the container
                      e.stopPropagation();
                      onSelectCut?.(cut);
                    }} 
                    className={onSelectCut ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}
                  >
                    <title>{`Client: ${cut.customerName}${cut.soNumber ? `\nS.O. No: ${cut.soNumber}` : ''}\nSize: ${formatVal(cut.length)}${unit} x ${formatVal(cut.width)}${unit}${onSelectCut ? '\nClick to delete cut' : ''}`}</title>
                    <rect 
                      x={cut.x * SCALE} 
                      y={cut.y * SCALE} 
                      width={rectWidthPx} 
                      height={rectHeightPx} 
                      fill={cut.isInventoryCut ? '#1e293b' : (cut.color || '#334155')} 
                      fillOpacity="0.9" 
                      stroke="#0f172a" 
                      strokeWidth={dynamicStrokeWidth} 
                      rx={dynamicRx} 
                    />
                    {showText && (
                      <text 
                        x={(cut.x + cut.length / 2) * SCALE} 
                        y={(cut.y + cut.width / 2) * SCALE} 
                        textAnchor="middle" 
                        dominantBaseline="middle" 
                        fontSize="9.5" 
                        fontWeight="black" 
                        fill="white"
                      >
                        {!cut.soNumber ? (
                          <>
                            <tspan x={(cut.x + cut.length / 2) * SCALE} dy="-5">
                              {cut.isInventoryCut ? 'REUSE' : cut.customerName.substring(0, 12)}
                            </tspan>
                            <tspan x={(cut.x + cut.length / 2) * SCALE} dy="13" fontSize="8" fontWeight="black" fill="rgba(255, 255, 255, 0.85)">
                              {`${formatVal(cut.length)}${unit} x ${formatVal(cut.width)}${unit}`}
                            </tspan>
                          </>
                        ) : (
                          <>
                            <tspan x={(cut.x + cut.length / 2) * SCALE} dy="-10">
                              {cut.isInventoryCut ? 'REUSE' : cut.customerName.substring(0, 12)}
                            </tspan>
                            <tspan x={(cut.x + cut.length / 2) * SCALE} dy="11" fontSize="8" fontWeight="black" fill="rgba(255, 255, 255, 0.85)">
                              {cut.soNumber}
                            </tspan>
                            <tspan x={(cut.x + cut.length / 2) * SCALE} dy="11" fontSize="7.5" fontWeight="bold" fill="rgba(255, 255, 255, 0.75)">
                              {`${formatVal(cut.length)}${unit} x ${formatVal(cut.width)}${unit}`}
                            </tspan>
                          </>
                        )}
                      </text>
                    )}

                    {/* Width indicator — inside-left of each cut */}
                    {cut.width * SCALE > 22 && (() => {
                      // Place INSIDE the cut, 10px from left edge
                      const cx = cut.x * SCALE + 10;
                      const topY = cut.y * SCALE + 4;
                      const botY = (cut.y + cut.width) * SCALE - 4;
                      const midY = (cut.y + cut.width / 2) * SCALE;
                      const labelW = 28;
                      const labelH = 12;
                      return (
                        <g style={{ pointerEvents: 'none' }}>
                          {/* Top segment of vertical line */}
                          <line x1={cx} y1={topY} x2={cx} y2={midY - labelH / 2 - 2} stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
                          {/* Bottom segment of vertical line */}
                          <line x1={cx} y1={midY + labelH / 2 + 2} x2={cx} y2={botY} stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
                          {/* Top cap */}
                          <line x1={cx - 4} y1={topY} x2={cx + 4} y2={topY} stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
                          {/* Bottom cap */}
                          <line x1={cx - 4} y1={botY} x2={cx + 4} y2={botY} stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
                          {/* Pill background for label */}
                          <rect
                            x={cx - labelH / 2}
                            y={midY - labelW / 2}
                            width={labelH}
                            height={labelW}
                            rx={5}
                            fill="rgba(0,0,0,0.45)"
                            transform={`rotate(-90, ${cx}, ${midY})`}
                          />
                          {/* Width label rotated 90° */}
                          <text
                            x={cx}
                            y={midY}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="8"
                            fontWeight="900"
                            fill="white"
                            transform={`rotate(-90, ${cx}, ${midY})`}
                            style={{ letterSpacing: '0.3px' }}
                          >
                            {`${formatVal(cut.width)}${unit}`}
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })}

              {/* Manual mode live guidelines */}
              {manualMode && mousePos && (
                <g style={{ pointerEvents: 'none' }}>
                  {/* Vertical coordinate line */}
                  <line
                    x1={mousePos.x * SCALE}
                    y1={0}
                    x2={mousePos.x * SCALE}
                    y2={viewHeight}
                    stroke="rgba(59, 130, 246, 0.4)"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                  />
                  {/* Horizontal coordinate line */}
                  <line
                    x1={0}
                    y1={mousePos.y * SCALE}
                    x2={viewWidth}
                    y2={mousePos.y * SCALE}
                    stroke="rgba(59, 130, 246, 0.4)"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                  />
                </g>
              )}

              {/* Manual mode live ghost preview */}
              {manualMode && mousePos && manualDimensions && (() => {
                const ghostWidthPx = manualDimensions.length * SCALE;
                const ghostHeightPx = manualDimensions.width * SCALE;
                const dynamicGhostStrokeWidth = Math.max(0.5, Math.min(3, ghostHeightPx * 0.3));
                const dynamicGhostRx = Math.max(0.5, Math.min(4, ghostHeightPx * 0.2));
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={mousePos.x * SCALE}
                      y={mousePos.y * SCALE}
                      width={ghostWidthPx}
                      height={ghostHeightPx}
                      fill={isValidPos ? 'url(#suggested-pattern-manual)' : 'url(#suggested-pattern-invalid)'}
                      stroke={isValidPos ? '#3b82f6' : '#ef4444'}
                      strokeWidth={dynamicGhostStrokeWidth}
                      strokeDasharray="8,4"
                      rx={dynamicGhostRx}
                    />
                    {/* Display dimensions/coords on the ghost preview if height is reasonable */}
                    {ghostHeightPx >= 25 && (
                      <>
                        <rect
                          x={mousePos.x * SCALE + 6}
                          y={mousePos.y * SCALE + 6}
                          width="100"
                          height="28"
                          rx="4"
                          fill="rgba(15, 23, 42, 0.85)"
                        />
                        <text
                          x={mousePos.x * SCALE + 12}
                          y={mousePos.y * SCALE + 18}
                          fontSize="8.5"
                          fontWeight="black"
                          fill="#60a5fa"
                        >
                          Pos: {formatVal(mousePos.x)}{unit}, {formatVal(mousePos.y)}{unit}
                        </text>
                        <text
                          x={mousePos.x * SCALE + 12}
                          y={mousePos.y * SCALE + 28}
                          fontSize="7.5"
                          fontWeight="bold"
                          fill="white"
                        >
                          Size: {formatVal(manualDimensions.length)}{unit} × {formatVal(manualDimensions.width)}{unit}
                        </text>
                      </>
                    )}
                  </g>
                );
              })()}

              {suggestedPlacement && (() => {
                const suggWidthPx = suggestedPlacement.length * SCALE;
                const suggHeightPx = suggestedPlacement.width * SCALE;
                const dynamicSuggStrokeWidth = Math.max(1, Math.min(5, suggHeightPx * 0.3));
                const dynamicSuggRx = Math.max(1, Math.min(6, suggHeightPx * 0.25));
                return (
                  <g className="animate-in fade-in zoom-in duration-300">
                    <rect 
                      x={suggestedPlacement.x * SCALE} 
                      y={suggestedPlacement.y * SCALE} 
                      width={suggWidthPx} 
                      height={suggHeightPx} 
                      fill={manualMode ? (isSuggestedValid ? "url(#suggested-pattern-manual)" : "url(#suggested-pattern-invalid)") : "url(#suggested-pattern-auto)"} 
                      stroke={manualMode ? (isSuggestedValid ? "#3b82f6" : "#ef4444") : "#10b981"} 
                      strokeWidth={dynamicSuggStrokeWidth} 
                      strokeDasharray="10,5" 
                      className="animate-pulse" 
                      rx={dynamicSuggRx}
                    />
                  </g>
                );
              })()}
            </g>
          </svg>
        </div>
      </div>
      )}
    </div>
  );
};

export default RollVisualizer;
