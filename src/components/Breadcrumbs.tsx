import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface Crumb {
  name: string;
  url: string;
}

interface BreadcrumbsProps {
  crumbs: Crumb[];
  className?: string;
}

const Breadcrumbs = ({ crumbs, className = '' }: BreadcrumbsProps) => {
  if (!crumbs || crumbs.length <= 1) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1.5 text-[11px] font-bold text-gray-500 overflow-x-auto whitespace-nowrap py-2 ${className}`}
    >
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={idx} className="flex items-center gap-1.5">
            {idx === 0 && <Home size={12} className="shrink-0" />}
            {crumb.url && !isLast ? (
              <Link
                to={crumb.url}
                className="hover:text-blue-600 transition-colors underline-offset-2 hover:underline"
              >
                {crumb.name}
              </Link>
            ) : (
              <span className={`${isLast ? 'text-gray-800' : 'text-gray-500'} line-clamp-1`}>
                {crumb.name}
              </span>
            )}
            {!isLast && <ChevronRight size={10} className="shrink-0 text-gray-400" />}
          </span>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
