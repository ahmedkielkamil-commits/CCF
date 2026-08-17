import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';

export const CLINIC_PHONE_DISPLAY = '(540) 252-1840';
export const CLINIC_PHONE_TEL = 'tel:+15402521840';
export const CLINIC_ADDRESS_LINE1 = '4532 Plank Road';
export const CLINIC_ADDRESS_LINE2 = 'Fredericksburg, VA 22407';
export const CLINIC_ADDRESS = `${CLINIC_ADDRESS_LINE1}, ${CLINIC_ADDRESS_LINE2}`;
export const CLINIC_MAPS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  '4532 Plank Rd, Fredericksburg, VA 22407'
)}`;

export function BrandHeader() {
  return (
    <header className="brandbar">
      <Link to="/" className="brandbar__logo" aria-label="The Children's Clinic of Fredericksburg — home">
        <img src={logo} alt="The Children's Clinic of Fredericksburg" />
      </Link>
      <button type="button" className="brandbar__menu" aria-label="Menu">
        <span />
        <span />
        <span />
      </button>
    </header>
  );
}

export function HelpFooter() {
  return (
    <a className="help-footer" href={CLINIC_PHONE_TEL}>
      <span className="help-footer__icon">
        <QuestionIcon />
      </span>
      <span className="help-footer__text">
        <strong>Need help?</strong>
        <small>Call us at {CLINIC_PHONE_DISPLAY}</small>
      </span>
      <span className="help-footer__phone">
        <PhoneIcon size={32} />
      </span>
    </a>
  );
}

interface IconProps {
  size?: number;
}

function svgProps(size: number): {
  width: number;
  height: number;
  viewBox: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  'aria-hidden': true;
} {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
}

export function ClockIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function PeopleIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5" />
      <path d="M17 14a6 6 0 0 1 4 6" />
    </svg>
  );
}

export function BellIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function ShieldIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function PinIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function PhoneIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="currentColor" stroke="none">
      <path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11 11 0 0 0 3.5.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .56 3.5 1 1 0 0 1-.25 1z" />
    </svg>
  );
}

export function ChevronIcon({ size = 18 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function QuestionIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function CheckIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

export function BackIcon({ size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function Screen({ children, form = false }: { children: ReactNode; form?: boolean }) {
  return <main className={form ? 'screen screen--form' : 'screen'}>{children}</main>;
}
