import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/500.css';
import '@fontsource/noto-serif-sc/600.css';
import './styles.css';
import './mobile.css';
createRoot(document.getElementById('root')!).render(<App />);
