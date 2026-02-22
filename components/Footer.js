import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <p className="footer-brand">◈ Overlay Maps</p>
          <p>Maps where Geo meets Art</p>
        </div>
        <div>
          <p className="footer-heading">Shop</p>
          <Link href="/?category=apparel">Apparel</Link>
          <Link href="/?category=posters">Posters</Link>
          <Link href="/?category=stickers">Stickers</Link>
        </div>
        <div>
          <p className="footer-heading">Info</p>
          <a href="mailto:hello@overlaymaps.com">Contact</a>
          <a
            href="https://www.instagram.com/overlaymaps"
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram
          </a>
        </div>
      </div>
      <p className="footer-copy">© 2026 Overlay Maps • Powered by Printful + Stripe</p>
    </footer>
  );
}
