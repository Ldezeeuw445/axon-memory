/* Dev-only entry so the banner can be walked on its own, without disturbing
   the existing film on the landing's main entry. Not part of the production
   build's default page. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Banner from './Banner.jsx';
import '../styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Banner />
  </StrictMode>,
);
