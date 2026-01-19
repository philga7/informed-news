import { Link, useLocation } from 'react-router-dom';
import { 
  BarChart3, 
  Radar, 
  Eye, 
  AlertTriangle, 
  Target, 
  FileText, 
  Database,
  Menu,
  X,
  Sparkles
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  path: string;
  label: string;
  icon: typeof BarChart3;
  matchPattern?: (path: string) => boolean;
  group?: 'entry' | 'tier1' | 'tier2' | 'reference';
}

const navItems: NavItem[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: BarChart3,
    matchPattern: (path) => path === '/dashboard',
    group: 'entry',
  },
  {
    path: '/developing-news/xcom-profiles',
    label: 'Developing News',
    icon: Sparkles,
    matchPattern: (path) => path.startsWith('/developing-news'),
    group: 'entry',
  },
  {
    path: '/scan',
    label: 'Scan',
    icon: Radar,
    matchPattern: (path) => path === '/scan',
    group: 'tier1',
  },
  {
    path: '/watch-list',
    label: 'Watch List',
    icon: Eye,
    matchPattern: (path) => path === '/watch-list',
    group: 'tier1',
  },
  {
    path: '/indicators',
    label: 'Indicators',
    icon: AlertTriangle,
    matchPattern: (path) => path === '/indicators',
    group: 'tier1',
  },
  {
    path: '/topics',
    label: 'Topics',
    icon: Target,
    matchPattern: (path) => path === '/topics' || path.startsWith('/topics/'),
    group: 'tier2',
  },
  {
    path: '/source-records',
    label: 'Source Records',
    icon: FileText,
    matchPattern: (path) => path === '/source-records' || path.startsWith('/source-records/'),
    group: 'reference',
  },
  {
    path: '/sources',
    label: 'Sources',
    icon: Database,
    matchPattern: (path) => path === '/sources',
    group: 'reference',
  },
];

export function Sidebar() {
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isActive = (item: NavItem) => {
    if (item.matchPattern) {
      return item.matchPattern(location.pathname);
    }
    return location.pathname === item.path;
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-stone-800 rounded-lg text-stone-300 hover:bg-stone-700 transition-colors"
        aria-label="Toggle menu"
      >
        {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-40
          h-screen w-64
          bg-stone-900 border-r border-stone-800
          transform transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Navigation Items */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1 pt-6">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const active = isActive(item);
              
              // Add separator before Tier 2 and Reference sections
              const prevItem = index > 0 ? navItems[index - 1] : null;
              const showSeparator = 
                prevItem &&
                item.group &&
                prevItem.group &&
                ((item.group === 'tier2' && prevItem.group === 'tier1') ||
                 (item.group === 'reference' && prevItem.group !== 'reference'));

              return (
                <div key={item.path}>
                  {showSeparator && (
                    <div className="my-3 px-4">
                      <div className="h-px bg-stone-700"></div>
                    </div>
                  )}
                  <Link
                    to={item.path}
                    onClick={() => setIsMobileOpen(false)}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-lg
                      transition-all duration-200
                      ${
                        active
                          ? 'bg-accent text-white shadow-lg'
                          : 'text-stone-300 hover:bg-stone-800 hover:text-stone-100'
                      }
                    `}
                  >
                    <Icon size={20} className="flex-shrink-0" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Mobile overlay */}
        {isMobileOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-30"
            onClick={() => setIsMobileOpen(false)}
          />
        )}
      </aside>
    </>
  );
}

