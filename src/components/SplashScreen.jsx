import '../styles/theme.css'

function SplashScreen() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: 'var(--bg-warm)',
    }}>
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '1.6rem',
        color: 'var(--text-secondary)',
        letterSpacing: '0.05em',
        animation: 'fadeInText 2s ease forwards, fadeOut 1s 2.5s forwards',
        opacity: 0,
      }}>
        你来了。我在这里慢慢想，慢慢说。
      </p>
      <style>{`
        @keyframes fadeInText { to { opacity: 1; } }
        @keyframes fadeOut { to { opacity: 0; } }
      `}</style>
    </div>
  )
}

export default SplashScreen