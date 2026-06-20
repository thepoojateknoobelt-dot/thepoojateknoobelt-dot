import React, { useRef, useState } from 'react';
import { Roll, Cut, Unit } from '../types';
import { isSpaceAvailable } from '../services/optimizationEngine';
import { Box, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { getShortRollId } from '../utils';

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
  noBorder = false
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

  const lengthMarkers = Array.from({ length: Math.floor(roll.fullLength / 5) + 1 }, (_, i) => i * 5);
  // Width markers: show every 1m tick, but only label every 1m (clean spacing at SCALE=35)
  const widthTicks = Array.from({ length: Math.floor(roll.fullWidth * 2) + 1 }, (_, i) => i * 0.5);
  // Only label every 1m to avoid overlap
  const widthLabels = Array.from({ length: Math.floor(roll.fullWidth) + 1 }, (_, i) => i);

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
        <div style={{ width: (viewWidth + RULER_SIZE) * zoom, height: (viewHeight + RULER_SIZE + 40) * zoom, position: 'relative' }}>
          <svg 
            ref={svgRef}
            width={(viewWidth + RULER_SIZE) * zoom} 
            height={(viewHeight + RULER_SIZE + 40) * zoom} 
            viewBox={`0 0 ${viewWidth + RULER_SIZE} ${viewHeight + RULER_SIZE + 40}`}
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
              {lengthMarkers.map(m => (
                <g key={`l-${m}`} transform={`translate(${m * SCALE}, 0)`}>
                  <line y1="28" y2="40" stroke="#cbd5e1" strokeWidth="2" />
                  <text x="4" y="20" fontSize="10" fill="#64748b" fontWeight="900">{formatVal(m)}{unit}</text>
                </g>
              ))}
            </g>

            <g transform={`translate(0, ${RULER_SIZE})`}>
              <rect width={RULER_SIZE} height={viewHeight} fill="#f8fafc" stroke="#e2e8f0" />
              {/* Minor ticks every 0.5m */}
              {widthTicks.map(m => (
                <g key={`wt-${m}`} transform={`translate(0, ${m * SCALE})`}>
                  <line x1={Number.isInteger(m) ? 38 : 44} x2={RULER_SIZE} stroke="#cbd5e1" strokeWidth={Number.isInteger(m) ? 2 : 1} />
                </g>
              ))}
              {/* Labels only every 1m, horizontal, right-aligned */}
              {widthLabels.map(m => (
                <g key={`wl-${m}`} transform={`translate(0, ${m * SCALE})`}>
                  <text
                    x={RULER_SIZE - 6}
                    y={m === 0 ? 11 : 5}
                    fontSize="9"
                    fill="#64748b"
                    fontWeight="700"
                    textAnchor="end"
                  >
                    {formatVal(m)}{unit}
                  </text>
                </g>
              ))}
            </g>

            <g transform={`translate(${RULER_SIZE}, ${RULER_SIZE})`}>
              <rect width={viewWidth} height={viewHeight} fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />

              {roll.cuts.map((cut) => (
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
                    width={cut.length * SCALE} 
                    height={cut.width * SCALE} 
                    fill={cut.isInventoryCut ? '#1e293b' : (cut.color || '#334155')} 
                    fillOpacity="0.9" 
                    stroke="#0f172a" 
                    strokeWidth="2" 
                    rx="4" 
                  />
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
              ))}

              {/* Manual mode live ghost preview */}
              {manualMode && mousePos && manualDimensions && (
                <rect
                  x={mousePos.x * SCALE}
                  y={mousePos.y * SCALE}
                  width={manualDimensions.length * SCALE}
                  height={manualDimensions.width * SCALE}
                  fill={isValidPos ? 'url(#suggested-pattern-manual)' : 'url(#suggested-pattern-invalid)'}
                  stroke={isValidPos ? '#3b82f6' : '#ef4444'}
                  strokeWidth="3"
                  strokeDasharray="8,4"
                  rx="4"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {suggestedPlacement && (
                <g className="animate-in fade-in zoom-in duration-300">
                  <rect 
                    x={suggestedPlacement.x * SCALE} 
                    y={suggestedPlacement.y * SCALE} 
                    width={suggestedPlacement.length * SCALE} 
                    height={suggestedPlacement.width * SCALE} 
                    fill={manualMode ? (isSuggestedValid ? "url(#suggested-pattern-manual)" : "url(#suggested-pattern-invalid)") : "url(#suggested-pattern-auto)"} 
                    stroke={manualMode ? (isSuggestedValid ? "#3b82f6" : "#ef4444") : "#10b981"} 
                    strokeWidth="5" 
                    strokeDasharray="10,5" 
                    className="animate-pulse" 
                    rx="6"
                  />
                </g>
              )}
            </g>
          </svg>
        </div>
      </div>
      )}
    </div>
  );
};

export default RollVisualizer;
