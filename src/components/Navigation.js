'use strict';
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();
  const links = [
    { href: '/', label: 'Dashboard', icon: '⚡' },
    { href: '/identity', label: 'Identity Profile', icon: '🛡️' },
    { href: '/memory', label: 'Memory Vault', icon: '🧠' },
    { href: '/dev', label: 'Dev Mode', icon: '🛠️' },
  ];
  return (
    <header style={styles.header}>
      <div style={styles.navContainer} className="flex align-center justify-between">
        <Link href="/" style={styles.logoLink} className="flex align-center gap-2">
          <span style={styles.logoIcon}>🕉️</span>
          <span style={styles.logoText}>AUM</span>
        </Link>
        <nav style={styles.nav}>
          <ul style={styles.navList} className="flex gap-2">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    style={{ ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) }}
                    className={isActive ? "glow-text-primary" : ""}
                  >
                    <span style={styles.linkIcon}>{link.icon}</span>
                    <span style={styles.linkText}>{link.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

const styles = {
  header: {
    width: '100%',
    background: 'rgba(12, 13, 20, 0.5)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    padding: '1rem 0',
  },
  navContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 1.5rem',
    width: '100%',
  },
  logoLink: { cursor: 'pointer' },
  logoIcon: {
    fontSize: '1.75rem',
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontWeight: '800',
    fontSize: '1.5rem',
    letterSpacing: '0.05em',
  },
  nav: {},
  navList: { listStyle: 'none', display: 'flex', gap: '0.5rem' },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    borderRadius: '0.75rem',
    fontSize: '0.9rem',
    fontWeight: '500',
    transition: 'all var(--transition-fast)',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  navLinkActive: {
    color: 'var(--text-primary)',
    background: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'var(--border-glass)',
  },
  linkIcon: { fontSize: '1rem' },
  linkText: { display: 'inline' },
};
