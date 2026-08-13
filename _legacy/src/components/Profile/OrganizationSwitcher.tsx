import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, Settings, LogOut } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { authService } from '../../services';

export function OrganizationSwitcher() {
  const { currentOrganization, organizations, switchOrganization } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitch = (orgId: string) => {
    switchOrganization(orgId);
    setIsOpen(false);
    window.location.reload(); // Reload to clear component state
  };

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      setIsOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!currentOrganization) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg transition-colors duration-200 text-stone-200"
      >
        <Building2 size={16} />
        <span className="text-sm font-medium">{currentOrganization.name}</span>
        <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-stone-900 border border-stone-800 rounded-lg shadow-lg z-50">
          {/* Current Organization Header */}
          <div className="px-4 py-3 border-b border-stone-800">
            <p className="text-xs text-stone-500 mb-1">Current Organization</p>
            <p className="text-sm font-medium text-stone-200">{currentOrganization.name}</p>
            <p className="text-xs text-stone-400 mt-1">{currentOrganization.userRole}</p>
          </div>

          {/* Organization List */}
          {organizations.length > 1 && (
            <div className="py-2 border-b border-stone-800">
              <p className="px-4 py-2 text-xs text-stone-500 uppercase font-medium">Switch Organization</p>
              {organizations
                .filter(org => org.id !== currentOrganization.id)
                .map((org) => (
                  <button
                    key={org.id}
                    onClick={() => handleSwitch(org.id)}
                    className="w-full px-4 py-2 text-left text-sm text-stone-300 hover:bg-stone-800 transition-colors duration-150"
                  >
                    <div className="flex items-center justify-between">
                      <span>{org.name}</span>
                      <span className="text-xs text-stone-500">{org.userRole}</span>
                    </div>
                  </button>
                ))}
            </div>
          )}

          {/* Actions */}
          <div className="py-2">
            <button
              onClick={() => {
                navigate('/profile');
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-stone-300 hover:bg-stone-800 transition-colors duration-150 flex items-center gap-2"
            >
              <Settings size={16} />
              Profile & Settings
            </button>
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-stone-800 transition-colors duration-150 flex items-center gap-2"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

