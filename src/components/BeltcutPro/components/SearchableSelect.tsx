import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Plus } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onAddNew?: () => void;
  addNewText?: string;
  className?: string;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  onAddNew,
  addNewText = '+ Add Custom Material Type...',
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search query
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(search.toLowerCase()) ||
    option.value.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find(o => o.value === value);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch('');
        }}
        className={`w-full px-3 py-2 border rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between h-[34px] transition-colors ${
          disabled
            ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
            : 'border-zinc-200 bg-white text-zinc-800 cursor-pointer'
        }`}
      >
        <span className="truncate pr-2">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-[100%] mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 flex items-center gap-1.5 bg-slate-50">
            <Search size={12} className="text-slate-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-transparent text-xs font-bold text-slate-800 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Options List */}
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs font-bold transition-colors cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-650'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="truncate pr-2">{option.label}</span>
                    {isSelected && (
                      <span className="text-[10px] font-black text-indigo-600 shrink-0">✓</span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2.5 text-xs text-slate-400 text-center font-semibold">
                No matching options
              </div>
            )}
          </div>

          {/* Add New Option Action */}
          {onAddNew && (
            <button
              type="button"
              onClick={() => {
                onAddNew();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-xs font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer border-t border-indigo-100 flex items-center gap-1 shrink-0"
            >
              <Plus size={13} className="shrink-0" />
              <span className="truncate">{addNewText}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
