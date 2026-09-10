/**
 * GoogleCallback — página a la que Google redirige tras el login.
 * Lee el access_token del hash URL, lo pasa al opener y cierra el popup.
 */
export default function GoogleCallback() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');

  if (token && window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: 'GOOGLE_TOKEN', access_token: token }, window.location.origin);
  }
  window.close();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontFamily: 'sans-serif', color: '#555'
    }}>
      <p>Iniciando sesión con Google...</p>
    </div>
  );
}
