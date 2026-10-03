import { TILE } from './format';

/** Small product photo for tables; a colored category chip when there's no photo. */
export function Thumb({ src, category }: { src: string | null | undefined; category: string }) {
  return src
    ? <img className="thumb" src={src} alt="" loading="lazy" decoding="async" />
    : <span className="thumb-empty" style={{ background: TILE[category] ?? '#204B57' }} aria-hidden="true">{category.slice(0, 2)}</span>;
}
