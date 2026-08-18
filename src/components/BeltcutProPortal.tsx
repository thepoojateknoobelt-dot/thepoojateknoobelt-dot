import React, { useEffect } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';

interface BeltcutProPortalProps {
  url: string;
  onClose: () => void;
}

export const BeltcutProPortal: React.FC<BeltcutProPortalProps> = ({ url, onClose }) => {
  // Listen for escape key press to return to the portal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8fafc] overflow-hidden">
      {/* Premium Top Navigation Toolbar */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-[#f1f5f9] border-b border-blue-100 text-[#1e3a8a] shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Button 
            onClick={onClose} 
            variant="ghost" 
            className="flex items-center gap-2 hover:bg-[#dbeafe] hover:text-[#1e3a8a] text-[#1e3a8a] font-bold transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Pricing Portal</span>
          </Button>

          <div className="h-4 w-[1px] bg-blue-200/50" />
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#1e3a8a] tracking-wide">Beltcut Pro</span>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-extrabold uppercase">
              Embedded Active
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Escape Key Guide cap */}
          <div className="flex items-center gap-1.5 text-xs text-blue-800/60">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-black uppercase text-[#1e3a8a] bg-[#e2e8f0] border border-blue-200 rounded shadow-sm select-none">
              Esc
            </kbd>
            <span>to exit</span>
          </div>

          <a 
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-[#1e3a8a] transition-colors duration-200"
          >
            <span>Open in new tab</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Embedded Iframe Container */}
      <div className="flex-1 w-full bg-white relative">
        <iframe
          src={url}
          title="Beltcut Pro Optimizer"
          className="w-full h-full border-0 bg-white"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
        />
      </div>
    </div>
  );
};
