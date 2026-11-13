import { cn } from '@/lib/cn';

/*
 * Each platform's own mark, on the ground its owner uses for it. The files
 * are the owners' (public/brands/SOURCES.md); nothing here redraws them.
 */
const PLATFORMS = {
  salla: { src: '/brands/salla.svg', ground: 'bg-[#004956]', inset: 0.22 },
  zid: { src: '/brands/zid.svg', ground: 'bg-transparent', inset: 0 },
  shopify: { src: '/brands/shopify.svg', ground: 'bg-[#f3f8ec]', inset: 0.2 },
  woocommerce: { src: '/brands/woocommerce.svg', ground: 'bg-[#f6eff5]', inset: 0.16 },
  zapier: { src: '/brands/zapier.svg', ground: 'bg-transparent', inset: 0 },
  make: { src: '/brands/make.svg', ground: 'bg-[#f3ebfc]', inset: 0.22 },
  n8n: { src: '/brands/n8n.svg', ground: 'bg-[#fdedf1]', inset: 0.2 },
};

/**
 * A platform's mark in a rounded tile. Decorative: the platform's name is
 * always written beside it, so the image carries no alt text of its own.
 * A platform with no mark (the universal connection, a file) falls back to
 * the children, an icon in the house style.
 */
export function PlatformLogo({ platform, size = 44, className, children }) {
  const mark = PLATFORMS[platform];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl',
        mark ? mark.ground : 'bg-(--color-brand-soft) text-(--color-brand-text)',
        className,
      )}
      // Padding in pixels from the tile, not a percentage: a percentage is of
      // the CONTAINING block's width, which made the tile as wide as its card.
      style={{ width: size, height: size, padding: mark ? Math.round(size * mark.inset) : 0 }}
    >
      {mark ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local SVG, nothing to optimise
        <img src={mark.src} alt="" className="size-full object-contain" draggable={false} />
      ) : (
        children
      )}
    </span>
  );
}
