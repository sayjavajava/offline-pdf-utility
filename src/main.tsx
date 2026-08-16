import { createRoot } from 'react-dom/client'
// Self-hosted fonts: this app must work with no network at all, so the
// typefaces are bundled rather than fetched from a CDN. The `wght` builds
// carry only the weight axis (no optical-size axis, no italics), which is
// all the UI uses.
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/space-grotesk/wght.css'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);
