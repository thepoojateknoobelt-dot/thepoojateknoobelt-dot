import React, { useEffect } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';

interface PresenceProPortalProps {
  url: string;
  onClose: () => void;
}

export const PresenceProPortal: React.FC<PresenceProPortalProps> = ({ url, onClose }) => {
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
    <div className="flex flex-col h-screen w-full bg-zinc-950 overflow-hidden">
      {/* Premium Top Navigation Toolbar */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-zinc-900 border-b border-zinc-800 text-zinc-300 shadow-md shrink-0">
        <div className="flex items-center gap-4">
          <Button 
            onClick={onClose} 
            variant="ghost" 
            className="flex items-center gap-2 hover:bg-zinc-800 hover:text-white text-zinc-300 font-bold transition-all duration-200 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Master Portal</span>
          </Button>

          <div className="h-4 w-[1px] bg-zinc-800" />
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white tracking-wide">PresencePro</span>
            <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-extrabold uppercase">
              Embedded Active
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Escape Key Guide cap */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-black uppercase text-zinc-300 bg-zinc-800 border border-zinc-700 rounded shadow-md select-none">
              Esc
            </kbd>
            <span>to exit</span>
          </div>

          <a 
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors duration-200"
          >
            <span>Open in new tab</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Embedded Iframe Container */}
      <div className="flex-1 w-full bg-zinc-900 relative">
        <iframe
          src={url}
          title="PresencePro HRMS"
          className="w-full h-full border-0 bg-white"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
        />
      </div>
    </div>
  );
};
