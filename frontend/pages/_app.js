import '../styles/globals.css'; // Directs Next.js to parse your custom Tailwind build

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}