import { publicAssetUrl } from '../assets';

export interface BrandLogoProps {
  /** Use the square summit mark for compact navigation and app surfaces. */
  compact?: boolean;
  className?: string;
  /** Set when nearby text already names the product. */
  decorative?: boolean;
}

/** Reusable WST brand mark. Consumers control sizing through the class name. */
export function BrandLogo({ compact = false, className = '', decorative = false }: BrandLogoProps) {
  const source = compact ? 'assets/brand/wst-icon.png' : 'assets/brand/wst-brandmark.png';
  const classes = ['brand-logo', compact ? 'brand-logo--compact' : '', className].filter(Boolean).join(' ');
  return (
    <span className={classes} role={decorative ? 'presentation' : undefined}>
      <img
        src={publicAssetUrl(source)}
        alt={decorative ? '' : 'WST — World Summit Tournament'}
        width={compact ? 1254 : 1536}
        height={compact ? 1254 : 1024}
        decoding="async"
      />
    </span>
  );
}

export default BrandLogo;
