import { ReactNode } from 'react';
import GraphIllustration from './GraphIllustration';

// Shared by login/register — was duplicated identically in both pages.
export function SsoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 5C3 3.89543 3.89543 3 5 3H14L21 10V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5Z"
        fill="#6D4AFF"
        opacity="0.9"
      />
      <path d="M14 3L21 10H16C14.8954 10 14 9.10457 14 8V3Z" fill="#9B7FFF" />
      <path d="M7 12H17M7 16H13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  children: ReactNode;
  // Register has more fields and can legitimately outgrow a short viewport,
  // so it keeps the page free to scroll (default). Login's form is short
  // enough to always fit — pass false there to pin it to the viewport with
  // no scrollbar instead of leaving a scrollable min-h-screen.
  scrollable?: boolean;
}

// Split-screen shell for /login and /register: form column on the left
// (full width below lg, half width at lg+), graph illustration filling the
// right half at lg+ only — matches the Navbar.tsx sm:block / dashboard
// md:grid-cols breakpoint convention already used elsewhere.
export default function AuthLayout({ children, scrollable = true }: Props) {
  return (
    <div
      className={`flex ${scrollable ? 'min-h-screen' : 'h-screen overflow-hidden'}`}
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 py-10 overflow-y-auto">
        <div className="w-full max-w-md">{children}</div>
      </div>

      <div
        className="hidden lg:flex lg:w-1/2 items-center justify-center relative"
        style={{
          background: 'linear-gradient(160deg, var(--bg-base) 0%, var(--bg-surface) 100%)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        <GraphIllustration />
      </div>
    </div>
  );
}
